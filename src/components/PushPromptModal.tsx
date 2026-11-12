import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/Modal";
import {
  isPushSupported,
  getExistingSubscription,
  subscribeOfficerToPush,
  subscribeStudentToPush,
  upgradeSubscriptionToStudent,
} from "@/lib/push";

const DISMISSED_KEY = "dtb-push-prompt-dismissed";

interface PushPromptModalProps {
  isLoggedIn: boolean;
  studentId?: string;
}

/**
 * Asks once per browser to enable push (skipped if permission was already
 * decided). Only officers and verified students are asked: student
 * subscriptions must be tied to a student record. Once a student verifies,
 * any prior subscription on this browser is reconciled with their record.
 */
export default function PushPromptModal({ isLoggedIn, studentId }: PushPromptModalProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoggedIn && !studentId) return;
    if (!isPushSupported() || typeof Notification === "undefined" || Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    getExistingSubscription()
      .then((existing) => {
        if (!existing && !cancelled) timer = setTimeout(() => setOpen(true), 1500);
      })
      .catch((error) => console.warn("Unable to check push subscription before prompting:", error));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoggedIn, studentId]);

  useEffect(() => {
    if (studentId) upgradeSubscriptionToStudent(studentId);
  }, [studentId]);

  // Either outcome is final: a denial is permanent in the browser anyway.
  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setOpen(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const result = isLoggedIn
        ? await subscribeOfficerToPush()
        : studentId
          ? await subscribeStudentToPush(studentId)
          : { ok: false as const, message: "Open your student record before enabling push notifications." };
      if (result.ok) toast.success("Push notifications enabled.");
      else toast.error(result.message || "Couldn't enable push notifications on this device.");
      dismiss();
    } catch (error) {
      // Unexpected failure (not a permission answer): keep the prompt so they can retry.
      console.error("Push prompt subscription failed:", error);
      toast.error("Couldn't enable push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={dismiss}
      size="sm"
      icon={<BellRing className="h-5 w-5" />}
      title="Stay updated"
      description="Get notified about payment confirmations, new files and contribution deadlines — even when you're not on the site."
      footer={
        <>
          <button onClick={dismiss} className="btn btn-secondary" disabled={busy}>
            Not now
          </button>
          <button onClick={enable} className="btn btn-primary" disabled={busy}>
            {busy ? "Enabling…" : "Enable"}
          </button>
        </>
      }
    />
  );
}
