import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { offlineSyncService, type SyncState } from "@/lib/offlineSync";

interface Failure {
  table: string;
  message: string;
}

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>(offlineSyncService.getState());
  const [pending, setPending] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [showSynced, setShowSynced] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async (nextState: SyncState) => {
      const [count, currentFailure] = await Promise.all([
        offlineSyncService.pendingCount(),
        offlineSyncService.firstFailure(),
      ]);
      if (cancelled) return;
      setPending(count);
      setFailure(currentFailure);

      // Only toast the moment a stall is first detected, not on every
      // re-render while it stays failed — the persistent card below already
      // covers that.
      if (nextState === "failed" && currentFailure) {
        toast.error(`A ${currentFailure.table} change couldn't sync`, {
          description: currentFailure.message,
        });
      }
    };

    void refresh(state);

    const unsubscribe = offlineSyncService.subscribe(() => {
      const nextState = offlineSyncService.getState();
      setState(nextState);
      void refresh(nextState);

      if (nextState === "synced") {
        setShowSynced(true);
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setShowSynced(false), 2000);
      } else if (nextState !== "offline") {
        // Leaving "synced" for any reason other than going offline clears
        // the confirmation early so it doesn't linger under a new banner.
        setShowSynced(false);
      }
    });

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      unsubscribe();
    };
    // Only re-subscribe on mount; `state` is read fresh inside the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await offlineSyncService.sync();
    } finally {
      setRetrying(false);
    }
  };

  const handleDiscard = async () => {
    if (!failure) return;
    const confirmed = window.confirm(
      `Discard the queued ${failure.table} change that keeps failing to sync?\n\n` +
        "This removes it from this device only — it will never be saved to the database.",
    );
    if (!confirmed) return;
    await offlineSyncService.discardOldest();
    void offlineSyncService.sync();
  };

  if (state === "failed" && failure) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg bg-red-600/95 px-3 py-3 text-sm text-white shadow-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
          <span>
            Couldn&apos;t sync a <strong>{failure.table}</strong> change
            {pending > 1 ? ` (${pending} pending)` : ""}
          </span>
        </div>
        <p className="break-words text-xs text-red-100/90">{failure.message}</p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-50"
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
          <button
            onClick={handleDiscard}
            className="rounded bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20"
          >
            Discard change
          </button>
        </div>
      </div>
    );
  }

  if (state === "syncing") {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-blue-500/90 px-3 py-2 text-sm text-white shadow-lg">
        <Loader2 className="w-4 h-4 animate-spin" />
        Syncing {pending} change{pending === 1 ? "" : "s"}...
      </div>
    );
  }

  if (state === "offline" && pending > 0) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-gray-700/90 px-3 py-2 text-sm text-white shadow-lg">
        <CloudOff className="w-4 h-4" />
        Offline — {pending} change{pending === 1 ? "" : "s"} will sync when
        you&apos;re back online
      </div>
    );
  }

  if (showSynced && state === "synced") {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-green-500/90 px-3 py-2 text-sm text-white shadow-lg">
        <CheckCircle2 className="w-4 h-4" />
        All changes synced
      </div>
    );
  }

  return null;
}
