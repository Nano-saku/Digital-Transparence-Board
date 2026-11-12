import { useEffect, useRef, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { offlineSyncService } from "@/lib/offlineSync";

/** Supabase Realtime channel status values. */
type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/** Tables whose offline cache is dropped on a realtime event so the next read refetches. */
const CACHEABLE_TABLES = new Set(["students", "events", "lsc_officers", "attendance", "contributions", "payments"]);
/** Coalesces bursts of events (bulk writes) into one refetch. */
const DEBOUNCE_MS = 350;
/** Delay before refetching after a channel error, giving Realtime time to stabilise. */
const RECONNECT_REFETCH_DELAY_MS = 800;

function invalidateCache(table: string): void {
  if (!CACHEABLE_TABLES.has(table)) return;
  offlineSyncService
    .invalidate(table as Parameters<typeof offlineSyncService.invalidate>[0])
    .catch((err) => console.warn(`[useRealtimeSync] invalidate(${table}):`, err));
}

/**
 * One channel for `tables`: `onEvent(table)` runs per change, `onChange` once per
 * debounced burst. Returns the teardown.
 */
function openChannel(
  prefix: string,
  tables: readonly string[],
  onChange: () => void,
  onEvent?: (table: string) => void,
  onStatus?: (status: ChannelStatus) => void,
): () => void {
  const sb = getSupabase();
  const channel = sb.channel(`${prefix}-${crypto.randomUUID()}`);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      if (destroyed) return;
      onEvent?.(table);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => !destroyed && onChange(), DEBOUNCE_MS);
    });
  }
  channel.subscribe((status) => {
    if (!destroyed) onStatus?.(status as ChannelStatus);
  });

  return () => {
    destroyed = true;
    clearTimeout(debounceTimer);
    void sb.removeChannel(channel);
  };
}

export interface UseRealtimeSyncOptions {
  /** Tables to subscribe to (subscribe only to what is needed). */
  tables: readonly string[];
  /** Called when a committed database change is detected. */
  onChange: () => void;
  /** Optional channel name prefix. Defaults to "rt-sync". */
  channelPrefix?: string;
  /** Also call onChange once after mount (replaces a separate initial-load effect). */
  triggerOnMount?: boolean;
  /** Optional callback when the Supabase channel status changes. */
  onStatusChange?: (status: ChannelStatus) => void;
}

/**
 * Supabase Realtime subscription for a component: one channel per call site,
 * debounced `onChange`, offline-cache invalidation, a refetch after a channel
 * error/timeout (and again once it re-subscribes), and full teardown on unmount.
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
  useEffect(() => {
    onChangeRef.current = onChange;
    onStatusRef.current = onStatusChange;
  }, [onChange, onStatusChange]);

  const tablesKey = [...tables].sort().join(",");

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let destroyed = false;

    const refetchSoon = () => {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        tables.forEach(invalidateCache);
        onChangeRef.current();
      }, RECONNECT_REFETCH_DELAY_MS);
    };

    const close = openChannel(channelPrefix, tables, () => onChangeRef.current(), invalidateCache, (status) => {
      onStatusRef.current?.(status);
      const recovering = status === "SUBSCRIBED" && reconnectTimer !== undefined;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || recovering) refetchSoon();
    });

    if (triggerOnMount) {
      void Promise.resolve().then(() => !destroyed && onChangeRef.current());
    }

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      close();
    };
    // `tables` is tracked through tablesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, channelPrefix, triggerOnMount]);
}

/**
 * Wraps a data-load function so overlapping calls (e.g. simultaneous realtime
 * events) run at most one fetch in flight plus one pending follow-up with the
 * latest args, preventing double-counting in financial calculations.
 */
export function useIdempotentLoader<T extends unknown[]>(loader: (...args: T) => Promise<void>): (...args: T) => void {
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
          if (next) void run(next.args);
        }
      };
      void run(args);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

/**
 * Non-hook subscription (debounced `onChange`, no cache invalidation) for use
 * outside React components. Returns the teardown.
 */
export function createRealtimeSubscription(
  tables: readonly string[],
  onChange: () => void,
  channelPrefix = "rt-svc",
): () => void {
  return openChannel(channelPrefix, tables, onChange);
}
