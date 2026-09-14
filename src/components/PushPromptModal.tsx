import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isPushSupported,
  getExistingSubscription,
  subscribeOfficerToPush,
  subscribeStudentToPush,
  subscribeAnonymousToPush,
  upgradeSubscriptionToStudent,
} from "@/lib/push";

const DISMISSED_KEY = "dtb-push-prompt-dismissed";

interface PushPromptModalProps {
  isLoggedIn: boolean;
  studentId?: string;
}

/**
 * Proactively asks visitors to enable push, instead of waiting for someone
 * to find the toggle in the bell dropdown. Shows at most once per browser
 * (tracked in localStorage) and never if permission was already
 * denied/granted. Also stays mounted permanently (regardless of whether
 * the popup itself is showing) to silently re-link an anonymous
 * subscription to a real student the moment one verifies.
 */
export default function PushPromptModal({ isLoggedIn, studentId }: PushPromptModalProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Decide once, on mount, whether to show the ask at all.
  useEffect(() => {
    let cancelled = false;

    async function checkShouldPrompt() {
      if (!isPushSupported()) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "denied" || Notification.permission === "granted") return;
      if (localStorage.getItem(DISMISSED_KEY)) return;

      const existing = await getExistingSubscription();
      if (existing) return;

      if (!cancelled) {
        const timer = setTimeout(() => setOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    }

    checkShouldPrompt();
    return () => {
      cancelled = true;
    };
    // Only re-check on identity changes (e.g. logging in), not every render.
  }, [isLoggedIn, studentId]);

  // Whenever a visitor verifies as a specific student, silently upgrade
  // any existing anonymous/prior subscription on this browser to match —
  // no prompt, no popup, permission is already granted at that point.
  useEffect(() => {
    if (studentId) {
      upgradeSubscriptionToStudent(studentId);
    }
  }, [studentId]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setOpen(false);
  }

  async function handleEnable() {
    setBusy(true);
    try {
      const result = isLoggedIn
        ? await subscribeOfficerToPush()
        : studentId
          ? await subscribeStudentToPush(studentId)
          : await subscribeAnonymousToPush();

      if (result.ok) {
        toast.success("Push notifications enabled.");
        localStorage.setItem(DISMISSED_KEY, "1");
        setOpen(false);
      } else {
        toast.error(result.message || "Couldn't enable push notifications on this device.");
        // Permission denial is permanent in the browser either way — no
        // point asking again on this device.
        localStorage.setItem(DISMISSED_KEY, "1");
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="glass-card-strong w-[calc(100%-2rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl text-dark flex items-center gap-2">
            <BellRing className="w-5 h-5 text-royal-blue" />
            Stay updated
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-secondary mt-2">
          Get notified about payment confirmations, new files, and contribution deadlines —
          even when you're not on the site.
        </p>

        <div className="flex gap-3 pt-4">
          <button onClick={dismiss} className="flex-1 glass-button px-4 py-2.5" disabled={busy}>
            Not now
          </button>

          <button
            onClick={handleEnable}
            className="flex-1 btn-primary px-4 py-2.5"
            disabled={busy}
          >
            {busy ? "Enabling..." : "Enable"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
