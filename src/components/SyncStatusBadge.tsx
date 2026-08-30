import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { offlineSyncService, type SyncState } from "@/lib/offlineSync";

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>(offlineSyncService.getState());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    return offlineSyncService.subscribe(() => {
      const nextState = offlineSyncService.getState();

      setState(nextState);

      if (nextState === "synced") {
        setVisible(true);

        if (hideTimer) clearTimeout(hideTimer);

        hideTimer = setTimeout(() => {
          setVisible(false);
        }, 2000);
      }
    });
  }, []);

  if (!visible || state !== "synced") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm shadow-lg bg-green-500/90">
      <CheckCircle2 className="w-4 h-4" />
      All changes synced
    </div>
  );
}
