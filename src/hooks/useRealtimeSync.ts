import { useEffect, useRef, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { offlineSyncService } from "@/lib/offlineSync";

/** Supabase Realtime channel status values. */
type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/**
 * Tables whose offline cache must be invalidated when a realtime event
 * arrives, so the next getAll() call fetches fresh data from the server.
 */
const CACHEABLE_TABLES = new Set([
  "students", "events", "lsc_officers",
  "attendance", "contributions", "payments",
]);

/**
 * Minimum interval between two consecutive realtime-triggered refetches.
 * Prevents flooding the database on bulk writes.
 */
const DEBOUNCE_MS = 350;

/**
 * Delay before re-fetching after a channel reconnects. Gives Supabase
 * Realtime time to stabilise and reduces stale-read risk.
 */
const RECONNECT_REFETCH_DELAY_MS = 800;

export interface UseRealtimeSyncOptions {
  /** Tables to subscribe to (subscribe only to what is needed). */
  tables: readonly string[];
  /**
   * Called when a committed database change is detected.
   * Keep this callback stable (useCallback) to avoid channel recreation.
   */
  onChange: () => void;
  /** Optional channel name prefix. Defaults to "rt-sync". */
  channelPrefix?: string;
  /**
   * When true, onChange is called once after mount so the caller can
   * skip a separate `useEffect(() => loadData(), [loadData])`.
   */
  triggerOnMount?: boolean;
  /** Optional callback when the Supabase channel status changes. */
  onStatusChange?: (status: ChannelStatus) => void;
}

/**
 * useRealtimeSync – authoritative Supabase Realtime subscription hook.
 *
 * Features:
 * - Single channel per call site — no duplicate subscriptions.
 * - Debounced onChange to prevent duplicate processing on bulk writes.
 * - Automatic cache invalidation for offline-capable tables.
 * - Reconnection recovery: re-fetches after channel error/timeout.
 * - Clean teardown on unmount (channel removed, timers cleared).
 */
export function useRealtimeSync({
  tables,
  onChange,
  channelPrefix = "rt-sync",
  triggerOnMount = false,
  onStatusChange,
}: UseRealtimeSyncOptions): void {
  const onChangeRef = useRef(onChange);
  const onStatusRef = useRef(onStatusChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onStatusRef.current = onStatusChange; }, [onStatusChange]);

  const tablesKey = [...tables].sort().join(",");

  useEffect(() => {
    const sb = getSupabase();
    const channel = sb.channel(`${channelPrefix}-${crypto.randomUUID()}`);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const clearTimers = () => {
      if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    const debouncedOnChange = () => {
      if (destroyed) return;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!destroyed) onChangeRef.current();
      }, DEBOUNCE_MS);
    };

    const invalidateCaches = (table: string) => {
      if (!CACHEABLE_TABLES.has(table)) return;
      void offlineSyncService
        .invalidate(table as Parameters<typeof offlineSyncService.invalidate>[0])
        .catch((err) => console.warn(`[useRealtimeSync] invalidate(${table}):`, err));
    };

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (destroyed) return;
          invalidateCaches(table);
          debouncedOnChange();
        },
      );
    }

    channel.subscribe((status: string) => {
      if (destroyed) return;
      const s = status as ChannelStatus;
      onStatusRef.current?.(s);

      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        if (reconnectTimer !== null) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!destroyed) {
            for (const table of tables) invalidateCaches(table);
            onChangeRef.current();
          }
        }, RECONNECT_REFETCH_DELAY_MS);
      }

      if (s === "SUBSCRIBED" && reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!destroyed) {
            for (const table of tables) invalidateCaches(table);
            onChangeRef.current();
          }
        }, RECONNECT_REFETCH_DELAY_MS);
      }
    });

    if (triggerOnMount) {
      Promise.resolve().then(() => { if (!destroyed) onChangeRef.current(); });
    }

    return () => {
      destroyed = true;
      clearTimers();
      void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, channelPrefix, triggerOnMount]);
}

/**
 * Returns a stable callable that wraps a data-load function with
 * deduplication: simultaneous realtime events result in at most one
 * inflight fetch plus one pending follow-up, preventing duplicate
 * processing and double-counting of financial calculations.
 */
export function useIdempotentLoader<T extends unknown[]>(
  loader: (...args: T) => Promise<void>,
): (...args: T) => void {
  const inFlightRef = useRef(false);
  const pendingRef = useRef<{ args: T } | null>(null);

  return useCallback(
    (...args: T) => {
      if (inFlightRef.current) {
        pendingRef.current = { args };
        return;
      }
      const run = async (runArgs: T) => {
        inFlightRef.current = true;
        try {
          await loader(...runArgs);
        } finally {
          inFlightRef.current = false;
          const next = pendingRef.current;
          pendingRef.current = null;
          if (next !== null) void run(next.args);
        }
      };
      void run(args);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

/**
 * Plain (non-hook) subscription factory for use inside service classes
 * or outside React components. For React components, prefer
 * `useRealtimeSync` to get automatic cleanup on unmount.
 */
export function createRealtimeSubscription(
  tables: readonly string[],
  onChange: () => void,
  channelPrefix = "rt-svc",
): () => void {
  const sb = getSupabase();
  const channel = sb.channel(`${channelPrefix}-${crypto.randomUUID()}`);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const debouncedOnChange = () => {
    if (destroyed) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!destroyed) onChange();
    }, DEBOUNCE_MS);
  };

  for (const table of tables) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => { if (!destroyed) debouncedOnChange(); },
    );
  }

  channel.subscribe();

  return () => {
    destroyed = true;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    void sb.removeChannel(channel);
  };
}

