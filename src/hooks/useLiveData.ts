import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

type Loaders = Record<string, () => Promise<unknown>>;
type Results<L extends Loaders> = { [K in keyof L]: Awaited<ReturnType<L[K]>> };
/** Required sources are always present; an optional one is undefined until it first loads. */
export type LiveData<C extends Loaders, O extends Loaders> = Results<C> & Partial<Results<O>>;

export interface LiveDataOptions<C extends Loaders, O extends Loaders> {
  /** Required sources: when one fails, `error` is set and `data` keeps its last good value. */
  sources: C;
  /** Optional sources: a failure keeps that key's last good value and is listed in `failed`. */
  optional?: O;
  /** Realtime tables whose changes trigger a background refresh. */
  tables: readonly string[];
  /** Realtime channel name prefix. */
  channel?: string;
  /** Refresh (in the background) whenever these values change. Must be JSON-serializable. */
  deps?: readonly unknown[];
  /** When false nothing is loaded (e.g. the viewer lacks permission). */
  enabled?: boolean;
  /** Return true to ignore realtime events for now (e.g. during a bulk import that reloads at the end). */
  paused?: () => boolean;
  /** Called when a required source fails. */
  onError?: (error: unknown) => void;
}

/**
 * A realtime refresh started this soon after a local write may read a snapshot
 * that predates it (PostgREST can lag the realtime event), so keys written
 * through `mutate` keep their local value against such refreshes.
 */
const WRITE_GRACE_MS = 4_000;

const messageOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : String(error);
};

/**
 * Loads several sources in parallel and keeps them live:
 * - `Promise.allSettled`: required vs optional sources, so one optional failure never hides the rest.
 * - Refreshes on realtime changes to `tables` (reconnect-aware via `useRealtimeSync`) and when `deps` change.
 * - Responses from superseded loads are dropped; unchanged keys keep their identity (no needless re-renders).
 * - `loading` is only true until the first load settles; refreshes never flash the loader.
 * - `mutate` applies a local write and protects it from older in-flight snapshots.
 */
export function useLiveData<C extends Loaders, O extends Loaders = Record<never, never>>(options: LiveDataOptions<C, O>) {
  const { tables, channel = "live-data", deps = [], enabled = true } = options;
  type Data = LiveData<C, O>;
  const [data, setData] = useState<Data | null>(null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const dataRef = useRef<Data | null>(null);
  const loadSeq = useRef(0);
  const writtenAt = useRef(new Map<string, number>());

  const run = useCallback(async (realtime = false) => {
    const { sources, optional, onError } = optionsRef.current;
    const all: Loaders = { ...optional, ...sources };
    const id = ++loadSeq.current;
    const startedAt = Date.now();
    const required = Object.keys(sources);
    const keys = [...required, ...Object.keys(optional ?? {})];
    const results = await Promise.allSettled(keys.map((key) => all[key]()));
    if (id !== loadSeq.current) return; // a newer load is under way

    const critical = results.find((r, i): r is PromiseRejectedResult => i < required.length && r.status === "rejected");
    if (critical) {
      console.error("[useLiveData] required source failed:", critical.reason);
      setError(messageOf(critical.reason));
      setSettled(true);
      onError?.(critical.reason);
      return;
    }

    const prev = dataRef.current;
    const next = { ...prev } as Record<string, unknown>;
    const nowFailed: string[] = [];
    let changed = !prev;
    results.forEach((result, i) => {
      const key = keys[i];
      if (result.status === "rejected") {
        console.warn(`[useLiveData] optional source "${key}" failed:`, result.reason);
        nowFailed.push(key);
        return;
      }
      const wrote = writtenAt.current.get(key);
      if (wrote !== undefined && (wrote >= startedAt || (realtime && startedAt - wrote < WRITE_GRACE_MS))) return;
      const old = prev?.[key as keyof Data];
      if (JSON.stringify(old) === JSON.stringify(result.value)) return;
      next[key] = result.value;
      changed = true;
    });
    if (changed) setData((dataRef.current = next as Data));
    setFailed((current) => (current.join() === nowFailed.join() ? current : nowFailed));
    setError(null);
    setSettled(true);
  }, []);

  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    if (enabled) void run();
  }, [enabled, depsKey, run]);

  useRealtimeSync({
    tables,
    channelPrefix: channel,
    onChange: () => {
      if (optionsRef.current.enabled !== false && !optionsRef.current.paused?.()) void run(true);
    },
  });

  /** Applies a local change to one key; older or racing refreshes will not overwrite it. */
  const mutate = useCallback(<K extends keyof Data>(key: K, update: (value: Data[K]) => Data[K]) => {
    const prev = dataRef.current;
    if (!prev) return;
    writtenAt.current.set(key as string, Date.now());
    setData((dataRef.current = { ...prev, [key]: update(prev[key]) }));
  }, []);

  /** Explicit refresh (e.g. after a write or a Retry button); never shows the loader. */
  const reload = useCallback(() => run(), [run]);

  return { data, loading: enabled && !settled, error, failed, reload, mutate };
}
