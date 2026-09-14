import { useEffect, useState } from "react";
import { Bell, BellRing, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  notificationsService,
  type AppNotification,
} from "@/services/notificationsService";
import type { ViewState } from "@/types";
import SendNotificationModal from "@/components/SendNotificationModal";
import {
  isPushSupported,
  getExistingSubscription,
  subscribeStudentToPush,
  subscribeOfficerToPush,
  unsubscribeFromPush,
} from "@/lib/push";

const LAST_SEEN_KEY = "dtb-public-notifications-last-seen";

interface NotificationBellProps {
  /** Same navigation callback Navigation.tsx already receives from App.tsx. */
  onNavigate: (view: ViewState) => void;
  /** Signed-in officer vs. anyone browsing the public site. */
  isLoggedIn: boolean;
  /** Set once a visitor has verified name + Student ID via the landing search. */
  studentId?: string;
}

/**
 * Notification bell for the nav bar. Three cases, because they're backed by
 * different trust models (see the notifications migration):
 *
 *  - Officer (isLoggedIn): real per-account + all_officers rows, gated by
 *    RLS, with server-tracked read state.
 *  - Verified student (studentId set): all_students broadcasts + that
 *    student's own targeted rows — same query StudentNotifications used,
 *    now surfaced through this same bell instead of a separate panel.
 *  - Anonymous (neither): all_students broadcasts only. No login, so no
 *    server-side read tracking in either student case — "seen" is just a
 *    local timestamp in this browser, purely cosmetic.
 */
export default function NotificationBell({
  onNavigate,
  isLoggedIn,
  studentId,
}: NotificationBellProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : (localStorage.getItem(LAST_SEEN_KEY) ?? ""),
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription()
      .then((sub) => setPushEnabled(!!sub))
      .catch(() => setPushEnabled(false));
  }, [isLoggedIn, studentId]);

  async function handleTogglePush() {
    if (pushBusy) return;
    setPushBusy(true);

    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast.success("Push notifications turned off.");
        return;
      }

      const result = isLoggedIn
        ? await subscribeOfficerToPush()
        : studentId
          ? await subscribeStudentToPush(studentId)
          : { ok: false as const, reason: "unsupported" as const };

      if (result.ok) {
        setPushEnabled(true);
        toast.success("Push notifications enabled.");
      } else if (result.reason === "permission-denied") {
        toast.error("Notification permission was denied.");
      } else {
        toast.error("Couldn't enable push notifications on this device.");
      }
    } catch (error) {
      console.error("Push toggle failed:", error);
      toast.error("Couldn't update push notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  const unreadCount = isLoggedIn
    ? items.filter((n) => !n.readAt).length
    : items.filter((n) => n.createdAt > lastSeen).length;

  useEffect(() => {
    if (isLoggedIn) {
      notificationsService
        .getForOfficer()
        .then(setItems)
        .catch((error) =>
          console.error("Failed to load notifications:", error),
        );

      return notificationsService.subscribeOfficer((n) =>
        setItems((prev) =>
          prev.some((item) => item.id === n.id) ? prev : [n, ...prev],
        ),
      );
    }

    if (studentId) {
      notificationsService
        .getForStudent(studentId)
        .then(setItems)
        .catch((error) =>
          console.error("Failed to load notifications:", error),
        );

      return notificationsService.subscribeStudent(studentId, (n) =>
        setItems((prev) =>
          prev.some((item) => item.id === n.id) ? prev : [n, ...prev],
        ),
      );
    }

    notificationsService
      .getPublicBroadcasts()
      .then(setItems)
      .catch((error) => console.error("Failed to load notifications:", error));

    return notificationsService.subscribePublicBroadcasts((n) =>
      setItems((prev) =>
        prev.some((item) => item.id === n.id) ? prev : [n, ...prev],
      ),
    );
  }, [isLoggedIn, studentId]);

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !isLoggedIn) {
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SEEN_KEY, now);
      setLastSeen(now);
    }
  }

  async function handleSelect(n: AppNotification) {
    if (isLoggedIn && !n.readAt) {
      await notificationsService.markAsRead(n.id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === n.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
    }
    // n.link holds a ViewState string (e.g. "payment-management"), set by the
    // notification triggers — officer-only, public broadcasts never set one.
    if (n.link) {
      onNavigate(n.link as ViewState);
      setOpen(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await notificationsService.deleteNotification(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete notification:", error);
      toast.error("Failed to delete notification.");
    }
  }

  async function handleMarkAllRead() {
    await notificationsService.markAllReadForOfficer();
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="relative flex items-center gap-1.5 text-sm text-silver-gray hover:text-lsc-gold transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-status-danger text-white text-[10px] leading-4 text-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80 p-0 glass-card-strong">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold text-foreground">
              {isLoggedIn || studentId ? "Notifications" : "Announcements"}
            </span>
            <div className="flex items-center gap-3">
              {isLoggedIn && (
                <button
                  onClick={() => {
                    setOpen(false);
                    setComposeOpen(true);
                  }}
                  className="flex items-center gap-1 text-xs text-royal-blue hover:underline"
                  aria-label="Send a notification"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New
                </button>
              )}
              {isLoggedIn && unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-royal-blue hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-text-secondary text-center">
              {isLoggedIn || studentId
                ? "No notifications yet."
                : "No announcements yet."}
            </p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-1 py-2 px-3 border-b border-border/50 last:border-b-0 ${
                  isLoggedIn && !n.readAt ? "bg-muted/60" : ""
                }`}
              >
                <button
                  onClick={() => handleSelect(n)}
                  className="flex-1 flex flex-col items-start gap-0.5 text-left"
                >
                  <span className="text-sm font-medium text-foreground">
                    {n.title}
                  </span>
                  <span className="text-xs text-text-secondary">{n.body}</span>
                </button>

                {isLoggedIn && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(n.id);
                    }}
                    className="shrink-0 p-1 text-text-secondary hover:text-status-danger transition-colors"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}

          {(isLoggedIn || studentId) && isPushSupported() && (
            <button
              onClick={handleTogglePush}
              disabled={pushBusy}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-border text-xs text-royal-blue hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              <BellRing className="w-3.5 h-3.5" />
              {pushEnabled
                ? "Turn off push notifications"
                : "Get push notifications on this device"}
            </button>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isLoggedIn && (
        <SendNotificationModal
          open={composeOpen}
          onOpenChange={setComposeOpen}
        />
      )}
    </>
  );
}
