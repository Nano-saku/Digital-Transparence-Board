import { getSupabase } from "@/lib/supabase";
import type { UserRole } from "@/types";

export type SyncState = "online" | "offline" | "syncing" | "synced" | "failed";
type TableName =
  | "students"
  | "events"
  | "attendance"
  | "contributions"
  | "payments"
  | "transactions"
  | "feedback"
  | "board_members";
type MutationKind = "create" | "update" | "delete";

interface CachedTable<T = unknown> {
  key: string;
  ownerId: string;
  table: TableName;
  records: T[];
  updatedAt: number;
}

interface QueuedMutation {
  key: string;
  ownerId: string;
  id: string;
  table: TableName;
  kind: MutationKind;
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

interface OfflineDatabase extends IDBDatabase {
  transaction(storeNames: "tables" | "mutations", mode?: IDBTransactionMode): IDBTransaction;
}

const DB_NAME = "digital-transparency-board-offline";
const DB_VERSION = 1;
const OFFICER_ROLES: readonly UserRole[] = [
  "admin",
  "secretary",
  "treasurer",
  "auditor",
  "board-member",
];

const hasIndexedDb = (): boolean => typeof indexedDB !== "undefined";
const onlineNow = (): boolean => typeof navigator === "undefined" || navigator.onLine;
const cacheKey = (ownerId: string, table: TableName): string => `${ownerId}:${table}`;

const request = <T>(value: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB request failed"));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });

const openDatabase = (): Promise<OfflineDatabase> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains("tables")) database.createObjectStore("tables", { keyPath: "key" });
      if (!database.objectStoreNames.contains("mutations")) {
        const mutations = database.createObjectStore("mutations", { keyPath: "key" });
        mutations.createIndex("by_owner_created", ["ownerId", "createdAt"]);
      }
    };
    open.onsuccess = () => resolve(open.result as OfflineDatabase);
    open.onerror = () => reject(open.error ?? new Error("Could not open offline storage"));
  });

const networkFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network(?:error)?|offline|load failed|fetch failed|timeout/i.test(message);
};

/**
 * Officer-only offline cache and mutation queue.  The server remains the
 * source of truth: local records are used only when connectivity is missing,
 * then operations are replayed in creation order once Supabase is reachable.
 */
class OfflineSyncService {
  private ownerId: string | null = null;
  private enabled = false;
  private state: SyncState = onlineNow() ? "online" : "offline";
  private listeners = new Set<() => void>();
  private syncInProgress = false;
  private initialized = false;

  configure(userId: string | null, role: UserRole | null): void {
    this.ownerId = userId;
    this.enabled = Boolean(userId && role && OFFICER_ROLES.includes(role));
    this.state = onlineNow() ? "online" : "offline";
    this.emit();
    if (this.enabled && onlineNow()) void this.sync();
  }

  start(): void {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("online", this.handleOnline);
  }

  stop(): void {
    if (!this.initialized || typeof window === "undefined") return;
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("online", this.handleOnline);
    this.initialized = false;
  }

  private handleOffline = (): void => {
    this.state = "offline";
    this.emit();
  };

  private handleOnline = (): void => {
    if (!this.isEnabled()) return;
    this.state = "online";
    this.emit();
    void this.sync();
  };

  isEnabled(): boolean {
    return this.enabled && Boolean(this.ownerId) && hasIndexedDb();
  }

  isOffline(): boolean {
    return this.isEnabled() && !onlineNow();
  }

  getState(): SyncState {
    return this.isEnabled() ? this.state : "online";
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private async database(): Promise<OfflineDatabase> {
    if (!hasIndexedDb) throw new Error("Offline storage is not available in this browser.");
    return openDatabase();
  }

  async read<T>(table: TableName): Promise<T[] | null> {
    if (!this.isEnabled() || !this.ownerId) return null;
    const database = await this.database();
    const transaction = database.transaction("tables", "readonly");
    const entry = await request(transaction.objectStore("tables").get(cacheKey(this.ownerId, table))) as CachedTable<T> | undefined;
    await transactionDone(transaction);
    return entry?.records ?? null;
  }

  async cache<T>(table: TableName, records: T[], merge = false): Promise<void> {
    if (!this.isEnabled() || !this.ownerId) return;
    const database = await this.database();
    const transaction = database.transaction("tables", "readwrite");
    const store = transaction.objectStore("tables");
    const key = cacheKey(this.ownerId, table);
    let next = records;
    if (merge) {
      const current = await request(store.get(key)) as CachedTable<T> | undefined;
      const byId = new Map((current?.records ?? []).map((record) => [String((record as { id?: unknown }).id), record]));
      records.forEach((record) => byId.set(String((record as { id?: unknown }).id), record));
      next = [...byId.values()];
    }
    store.put({ key, ownerId: this.ownerId, table, records: next, updatedAt: Date.now() } satisfies CachedTable<T>);
    await transactionDone(transaction);
  }

  private async mutateCache<T>(table: TableName, kind: MutationKind, recordId: string, makeLocal?: (current: T | undefined) => T): Promise<T | undefined> {
    if (!this.isEnabled() || !this.ownerId) return undefined;
    const current = await this.read<T>(table);
    const records = current ?? [];
    const index = records.findIndex((record) => String((record as { id?: unknown }).id) === recordId);
    if (kind === "delete") {
      if (index >= 0) await this.cache(table, records.filter((_, itemIndex) => itemIndex !== index));
      return undefined;
    }
    const next = makeLocal?.(index >= 0 ? records[index] : undefined);
    if (!next) return undefined;
    const nextRecords = index >= 0
      ? records.map((record, itemIndex) => (itemIndex === index ? next : record))
      : [...records, next];
    await this.cache(table, nextRecords);
    return next;
  }

  private async enqueue(mutation: Omit<QueuedMutation, "key" | "ownerId" | "createdAt" | "attempts">): Promise<void> {
    if (!this.ownerId) return;
    const database = await this.database();
    const transaction = database.transaction("mutations", "readwrite");
    transaction.objectStore("mutations").put({
      ...mutation,
      key: crypto.randomUUID(),
      ownerId: this.ownerId,
      createdAt: Date.now(),
      attempts: 0,
    } satisfies QueuedMutation);
    await transactionDone(transaction);
  }

  async mutation<T>(params: {
    table: TableName;
    kind: MutationKind;
    recordId: string;
    payload: Record<string, unknown>;
    makeLocal?: (current: T | undefined) => T;
    executeOnline: () => Promise<T>;
  }): Promise<T | undefined> {
    const queueOffline = async (): Promise<T | undefined> => {
      const local = await this.mutateCache<T>(params.table, params.kind, params.recordId, params.makeLocal);
      await this.enqueue({
        id: crypto.randomUUID(),
        table: params.table,
        kind: params.kind,
        recordId: params.recordId,
        payload: params.payload,
      });
      this.state = "offline";
      this.emit();
      return local;
    };

    if (!this.isEnabled()) return params.executeOnline();
    if (this.isOffline()) return queueOffline();
    try {
      const result = await params.executeOnline();
      await this.mutateCache<T>(params.table, params.kind, params.recordId, () => result);
      return result;
    } catch (error) {
      if (!networkFailure(error)) throw error;
      // navigator.onLine can remain true while a network request is failing
      // (for example, when Wi-Fi is connected but has no internet access).
      // Treat that condition as offline immediately so the mutation is queued
      // and the UI remains usable instead of waiting on repeated requests.
      this.state = "offline";
      this.emit();
      return queueOffline();
    }
  }

  private async queuedMutations(): Promise<QueuedMutation[]> {
    if (!this.ownerId) return [];
    const database = await this.database();
    const transaction = database.transaction("mutations", "readonly");
    const index = transaction.objectStore("mutations").index("by_owner_created");
    const entries = await request(index.getAll(IDBKeyRange.bound([this.ownerId, 0], [this.ownerId, Number.MAX_SAFE_INTEGER])));
    await transactionDone(transaction);
    return entries as QueuedMutation[];
  }

  private async removeMutation(key: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction("mutations", "readwrite");
    transaction.objectStore("mutations").delete(key);
    await transactionDone(transaction);
  }

  private async recordFailure(mutation: QueuedMutation, error: unknown): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction("mutations", "readwrite");
    transaction.objectStore("mutations").put({
      ...mutation,
      attempts: mutation.attempts + 1,
      lastError: error instanceof Error ? error.message : String(error),
    });
    await transactionDone(transaction);
  }

  private async replay(mutation: QueuedMutation): Promise<void> {
    const query = getSupabase().from(mutation.table);
    let error: { message?: string } | null = null;
    if (mutation.kind === "create") {
      // Client-created ids are primary keys. Upsert makes an interrupted replay
      // idempotent: if Supabase accepted a prior request but the response was
      // lost, this retry updates that exact same row instead of creating a copy.
      ({ error } = await query.upsert({ id: mutation.recordId, ...mutation.payload }, { onConflict: "id" }));
    } else if (mutation.kind === "update") {
      ({ error } = await query.update(mutation.payload).eq("id", mutation.recordId));
    } else {
      ({ error } = await query.delete().eq("id", mutation.recordId));
    }
    if (error) throw new Error(error.message ?? "Supabase synchronization failed");
  }

  async sync(): Promise<void> {
    if (!this.isEnabled() || !onlineNow() || this.syncInProgress) return;
    this.syncInProgress = true;
    this.state = "syncing";
    this.emit();
    try {
      for (const mutation of await this.queuedMutations()) {
        try {
          await this.replay(mutation);
          await this.removeMutation(mutation.key);
        } catch (error) {
          await this.recordFailure(mutation, error);
          this.state = networkFailure(error) ? "offline" : "failed";
          this.emit();
          return;
        }
      }
      this.state = "synced";
      this.emit();
    } catch (error) {
      this.state = networkFailure(error) ? "offline" : "failed";
      this.emit();
    } finally {
      this.syncInProgress = false;
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
