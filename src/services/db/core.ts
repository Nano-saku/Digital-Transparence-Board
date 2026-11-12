import { getSupabase } from "../../lib/supabase";
import { offlineSyncService } from "../../lib/offlineSync";
import { escapeLikePattern, splitSearchWords } from "../../lib/utils";

/** Tables offlineSyncService can cache and queue. */
export type Table = Parameters<typeof offlineSyncService.read>[0];
export type Row = Record<string, unknown>;
type Result<T> = PromiseLike<{ data: T; error: unknown }>;
type PageResult = PromiseLike<{ data: Row[] | null; error: unknown; count: number | null }>;

export const sb = () => getSupabase();
// Operational tables use TEXT primary keys (legacy Firestore ids), which
// Postgres never generates, so every client-created row needs one.
export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const DESC = { ascending: false };

/**
 * Throws a query's error, otherwise returns its data. The client is untyped
 * (rows are `any`), so callers name the shape they expect, e.g.
 * unwrap<Row>(... .single()) or unwrap<Row | null>(... .maybeSingle()).
 */
export async function unwrap<T = unknown>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

export const pgCode = (error: unknown): unknown =>
  typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;

export const isUniqueViolation = (error: unknown): boolean => pgCode(error) === "23505";

const defined = <T extends object>(record: T): Partial<T> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;

export function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

/** True when the browser reports no network interface at all. */
export const browserOffline = (): boolean => typeof navigator !== "undefined" && !navigator.onLine;

/**
 * Live connectivity check (navigator.onLine only says an interface is up):
 * a cheap HEAD count on `events`. Used by flows that must write directly to
 * the database and never fall back to the offline queue.
 */
export async function checkSupabaseConnection(timeoutMs = 8000): Promise<boolean> {
  if (browserOffline()) return false;
  try {
    const { error } = await sb()
      .from("events")
      .select("id", { count: "exact", head: true })
      .abortSignal(AbortSignal.timeout(timeoutMs));
    return !error;
  } catch {
    return false;
  }
}

// ============================================
// READS
// ============================================
const PAGE_SIZE = 1000;

// An unranged select is silently capped by PostgREST's project "Max Rows"
// setting, so full-table reads page with .range() until a short page.
async function fetchAllRows(fetchPage: (from: number, to: number) => Result<Row[] | null>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = (await unwrap<Row[] | null>(fetchPage(from, from + PAGE_SIZE - 1))) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Online-first full-table read that refreshes the offline cache and falls back to it. */
export async function cachedRead<T>(table: Table, fetcher: () => Promise<T[]>): Promise<T[]> {
  if (offlineSyncService.isOffline()) {
    const cached = await offlineSyncService.read<T>(table);
    if (cached) return cached;
  }
  try {
    const records = await fetcher();
    await offlineSyncService.cache(table, records);
    return records;
  } catch (error) {
    const cached = await offlineSyncService.read<T>(table);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Filtered read. Never writes the table cache (a subset would make a later
 * getAll() look incomplete) but falls back to filtering the cached table.
 */
export async function cachedQuery<T>(
  table: Table,
  fetcher: () => Promise<T[]>,
  matches: (record: T) => boolean,
): Promise<T[]> {
  const fromCache = async () => (await offlineSyncService.read<T>(table))?.filter(matches);
  if (offlineSyncService.isOffline()) {
    const cached = await fromCache();
    if (cached) return cached;
  }
  try {
    return await fetcher();
  } catch (error) {
    const cached = await fromCache();
    if (cached) return cached;
    throw error;
  }
}

/** Students whose name contains every typed word (any order) or whose student ID contains the query. */
export async function findStudentRows(query: string): Promise<Row[]> {
  let byName = sb().from("students").select("*").order("name");
  for (const word of splitSearchWords(query).map(escapeLikePattern)) {
    byName = byName.ilike("name", `%${word}%`);
  }
  const byId = sb()
    .from("students")
    .select("*")
    .ilike("student_id", `%${escapeLikePattern(query.trim())}%`)
    .order("name");
  const [names, ids] = await Promise.all([unwrap<Row[] | null>(byName), unwrap<Row[] | null>(byId)]);
  return [...new Map([...(names ?? []), ...(ids ?? [])].map((row: Row) => [row.id, row])).values()];
}

// ============================================
// AUDIT
// ============================================
export type AuditEntry = {
  actorUserId?: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
};
type Actor = Pick<AuditEntry, "actorUserId" | "actorName" | "actorRole">;

let cachedActor: { userId: string; actor: Actor } | null = null;

async function currentActor(): Promise<Actor> {
  const { data, error } = await sb().auth.getUser();
  const user = data.user;
  if (error || !user) return { actorName: "Unknown User", actorRole: "unknown" };
  if (cachedActor?.userId === user.id) return cachedActor.actor;

  const { data: role, error: roleError } = await sb()
    .from("user_roles")
    .select("role, name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError) console.warn("Could not load audit actor role:", roleError);

  const actor: Actor = {
    actorUserId: user.id,
    actorName: role?.name || user.user_metadata?.name || user.email || "Unknown User",
    actorRole: role?.role || "unknown",
  };
  cachedActor = { userId: user.id, actor };
  return actor;
}

export async function buildAudit(
  action: string,
  entityType: string,
  description: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<AuditEntry> {
  return { ...(await currentActor()), action, entityType, entityId, description, metadata };
}

// ============================================
// COLUMN MAPS
// ============================================
/** A plain column name, or how to read a field from a row and which columns writing it sets. */
type Field<V> = string | { read: (row: Row) => unknown; write?: (value: Exclude<V, undefined>) => Row };
type Columns<T> = { [K in Exclude<keyof T, "id">]?: Field<T[K]> };
type AnyField = string | { read: (row: Row) => unknown; write?: (value: unknown) => Row };

const same = (value: unknown) => value;
export const field = (column: string, read = same, write = same) => ({
  read: (row: Row) => read(row[column]),
  write: (value: unknown): Row => ({ [column]: write(value) }),
});
/** null/"" -> undefined. */
export const opt = (column: string) => field(column, (value) => value || undefined);
/** null -> undefined. */
export const nullable = (column: string) => field(column, (value) => value ?? undefined);
export const orElse = (column: string, fallback: unknown) => field(column, (value) => value ?? fallback);
export const flag = (column: string) => field(column, Boolean, Boolean);
export const readOnly = ({ read }: { read: (row: Row) => unknown }) => ({ read });

type QueryList = Result<Row[] | null>;

export function defineColumns<T extends { id: string }>(columns: Columns<T>) {
  const fields = Object.entries(columns) as [keyof T & string, AnyField][];

  const fromRow = (row: Row): T => {
    const record: Row = { id: row.id };
    for (const [key, f] of fields) record[key] = typeof f === "string" ? row[f] : f.read(row);
    return record as T;
  };

  /** Columns for every defined field of `patch` (undefined fields are left out). */
  const toRow = (patch: Partial<T>): Row => {
    const row: Row = {};
    for (const [key, f] of fields) {
      const value = patch[key];
      if (value === undefined) continue;
      if (typeof f === "string") row[f] = value;
      else if (f.write) Object.assign(row, f.write(value));
    }
    return row;
  };

  return {
    fromRow,
    toRow,
    list: async (query: QueryList): Promise<T[]> => ((await unwrap<Row[] | null>(query)) ?? []).map(fromRow),
    one: async (query: Result<Row | null>): Promise<T | null> => {
      const row = await unwrap<Row | null>(query);
      return row ? fromRow(row) : null;
    },
    /** One zero-based page plus the total count of rows matching the query. */
    async page(
      query: { range(from: number, to: number): PageResult },
      page: number,
      pageSize: number,
    ): Promise<{ data: T[]; total: number }> {
      const from = page * pageSize;
      const { data, error, count } = await query.range(from, from + pageSize - 1);
      if (error) throw error;
      return { data: (data ?? []).map(fromRow), total: count ?? 0 };
    },
  };
}

// ============================================
// OFFLINE-CAPABLE TABLES
// ============================================
// Session-lifetime memo for the reference tables every section loads in full
// (students, events). Holds the in-flight promise so concurrent mounts share
// one request; writes and realtime changes invalidate it. Only for tables
// whose sole full read is the unfiltered getAll().
const memo = new Map<Table, Promise<unknown[]>>();

type Kind = "create" | "update";
type Order = [column: string, options?: { ascending?: boolean; nullsFirst?: boolean }];

interface TableSpec<T> {
  name: Table;
  /** Audit entity type; upper-cased it prefixes the action (STUDENT_CREATED). */
  entity: string;
  /** "Failed to create <noun>" (default: entity). */
  noun?: string;
  /** "Updated <label> <id>." (default: "<noun> record"). */
  label?: string;
  columns: Columns<T>;
  order: Order[];
  memoize?: boolean;
  /** Column values every insert starts from. */
  createDefaults?: Row;
  /** Friendly message for a known Postgres error code. */
  errorMessage?: (code: unknown, kind: Kind, record: Partial<T>) => string | undefined;
  /** Online write; defaults to insert/update ... select().single(). */
  persist?: (kind: Kind, id: string, payload: Row) => Promise<Row>;
}

export function defineTable<T extends { id: string }>(spec: TableSpec<T>) {
  const { name, entity, noun = entity, label = `${noun} record`, order } = spec;
  const action = entity.toUpperCase();
  const columns = defineColumns<T>(spec.columns);

  /** select("*") in the table's order, with id as the unique tie-breaker so pages never overlap. */
  const query = (options?: { count: "exact" }) => {
    let q = sb().from(name).select("*", options);
    for (const [column, opts] of order) q = q.order(column, opts);
    return order.some(([column]) => column === "id") ? q : q.order("id");
  };

  const fetchAll = async (): Promise<T[]> =>
    (await fetchAllRows((from, to) => query().range(from, to))).map(columns.fromRow);

  const invalidate = () => {
    memo.delete(name);
  };

  const persist =
    spec.persist ??
    ((kind: Kind, id: string, payload: Row): Promise<Row> =>
      unwrap<Row>(
        kind === "create"
          ? sb().from(name).insert({ id, ...payload }).select().single()
          : sb().from(name).update(payload).eq("id", id).select().single(),
      ));

  /** Writes online (no offline queue) and maps the stored row. */
  const write = async (kind: Kind, id: string, payload: Row, record: Partial<T>): Promise<T> => {
    try {
      return columns.fromRow(await persist(kind, id, payload));
    } catch (error) {
      const message = spec.errorMessage?.(pgCode(error), kind, record);
      throw message ? new Error(message) : error;
    }
  };

  return {
    ...columns,
    query,
    invalidate,
    write,

    getAll(force = false): Promise<T[]> {
      if (!spec.memoize) return cachedRead(name, fetchAll);
      let pending = force ? undefined : (memo.get(name) as Promise<T[]> | undefined);
      if (!pending) {
        const request = cachedRead(name, fetchAll);
        pending = request;
        memo.set(name, request);
        request.catch(() => {
          if (memo.get(name) === request) memo.delete(name);
        });
      }
      return pending;
    },

    async create(record: Omit<T, "id">, description: string, metadata: Record<string, unknown>): Promise<T> {
      const id = newId();
      const payload = { ...spec.createDefaults, ...columns.toRow(record as Partial<T>) };
      const result = await offlineSyncService.mutation<T>({
        table: name,
        kind: "create",
        recordId: id,
        payload,
        audit: await buildAudit(`${action}_CREATED`, entity, description, id, metadata),
        makeLocal: () => ({ ...record, id }) as T,
        executeOnline: () => write("create", id, payload, record as Partial<T>),
      });
      invalidate();
      return required(result, `Failed to create ${noun}`);
    },

    async update(id: string, patch: Partial<T>, changes: object = patch): Promise<T> {
      const payload = columns.toRow(patch);
      const result = await offlineSyncService.mutation<T>({
        table: name,
        kind: "update",
        recordId: id,
        payload,
        audit: await buildAudit(`${action}_UPDATED`, entity, `Updated ${label} ${id}.`, id, { changes }),
        // Undefined fields are not sent, so they must not clear the local copy either.
        makeLocal: (current) => ({ ...(current as T), ...defined(patch), id }),
        executeOnline: () => write("update", id, payload, patch),
      });
      invalidate();
      return required(result, `Failed to update ${noun}`);
    },

    async delete(id: string): Promise<void> {
      await offlineSyncService.mutation<void>({
        table: name,
        kind: "delete",
        recordId: id,
        payload: {},
        audit: await buildAudit(`${action}_DELETED`, entity, `Deleted ${label} ${id}.`, id),
        executeOnline: async () => {
          await unwrap(sb().from(name).delete().eq("id", id));
        },
      });
      invalidate();
    },
  };
}

// ============================================
// REALTIME
// ============================================
const OFFLINE_CACHED: ReadonlySet<string> = new Set([
  "students",
  "events",
  "lsc_officers",
  "attendance",
  "contributions",
  "payments",
]);

/**
 * Calls onChange (debounced) whenever a row in any of `tables` changes, after
 * dropping that table's memo and offline cache so the caller's re-query hits
 * Supabase. After a channel error/timeout it does one recovery refetch.
 * Returns an unsubscribe.
 */
export const subscribeToTables = (
  tables: readonly string[],
  onChange: () => void,
  channelPrefix = "db-live",
): (() => void) => {
  const client = sb();
  const channel = client.channel(`${channelPrefix}-${crypto.randomUUID()}`);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const invalidate = (table: string) => {
    memo.delete(table as Table);
    if (!OFFLINE_CACHED.has(table)) return;
    offlineSyncService
      .invalidate(table as Table)
      .catch((err) => console.warn(`[subscribeToTables] cache invalidate(${table}):`, err));
  };

  const refetch = () => {
    debounceTimer = undefined;
    if (!destroyed) onChange();
  };

  const recover = () => {
    recoveryTimer = undefined;
    if (destroyed) return;
    tables.forEach(invalidate);
    onChange();
  };

  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      if (destroyed) return;
      invalidate(table);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refetch, 350);
    });
  }

  // Events missed while the channel was down are recovered by one refetch,
  // scheduled on error and pushed back once the channel resubscribes.
  channel.subscribe((status: string) => {
    if (destroyed) return;
    const failed = status === "CHANNEL_ERROR" || status === "TIMED_OUT";
    if (failed || (status === "SUBSCRIBED" && recoveryTimer !== undefined)) {
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(recover, 800);
    }
  });

  return () => {
    destroyed = true;
    clearTimeout(debounceTimer);
    clearTimeout(recoveryTimer);
    void client.removeChannel(channel);
  };
};
