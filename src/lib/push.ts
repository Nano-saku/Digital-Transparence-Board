import { notificationsService } from "@/services/notificationsService";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const TIMEOUT_MS = 12_000;

interface SubscribeResult {
  ok: boolean;
  reason?: "unsupported" | "permission-denied" | "no-vapid-key" | "error";
  message?: string;
}

/** Rejects with `message` if `operation` has not settled within 12s. */
function withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), TIMEOUT_MS);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timeoutId));
}

/** base64url VAPID key -> the byte array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

const errorResult = (error: unknown): SubscribeResult => ({
  ok: false,
  reason: "error",
  message: error instanceof Error ? error.message : String(error),
});

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration =
    (await withTimeout(navigator.serviceWorker.getRegistration(), "Timed out while checking the notification service worker.")) ??
    (await withTimeout(navigator.serviceWorker.register("/sw.js"), "Unable to register the notification service worker."));
  if (registration.active) return registration;

  // A worker can stay installing/waiting forever on a misconfigured deployment; never block the UI on it.
  const ready = await withTimeout(
    navigator.serviceWorker.ready,
    "Notification service worker did not become ready. Please refresh and try again.",
  );
  if (!ready.active) throw new Error("Notification service worker is not active yet.");
  return ready;
}

const currentSubscription = (registration: ServiceWorkerRegistration) =>
  withTimeout(registration.pushManager.getSubscription(), "Timed out while checking the existing push subscription.");

/** This browser's existing PushSubscription, or null. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  return isPushSupported() ? currentSubscription(await getRegistration()) : null;
}

const toKeys = (subscription: PushSubscription) => {
  const { keys } = subscription.toJSON();
  return { endpoint: subscription.endpoint, p256dh: keys?.p256dh ?? "", authKey: keys?.auth ?? "" };
};

type PushKeys = ReturnType<typeof toKeys>;

/** Asks permission, subscribes this browser (reusing an existing subscription), then stores it via `save`. */
async function subscribe(save: (keys: PushKeys) => Promise<void>): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported", message: "Push isn't supported in this browser." };
  }
  if (!VAPID_PUBLIC_KEY) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set.");
    return { ok: false, reason: "no-vapid-key", message: "Missing VAPID public key configuration." };
  }

  let subscription: PushSubscription;
  try {
    const permission =
      Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      return {
        ok: false,
        reason: "permission-denied",
        message: "Notification permission is blocked. Enable it in your browser's site settings, then try again.",
      };
    }
    const registration = await getRegistration();
    subscription =
      (await currentSubscription(registration)) ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: newer TS libs type the array as Uint8Array<ArrayBufferLike>.
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }),
        "Timed out while creating the push subscription.",
      ));
  } catch (error) {
    console.error("Push subscribe failed:", error);
    return errorResult(error);
  }

  try {
    await save(toKeys(subscription));
    return { ok: true };
  } catch (error) {
    console.error("Saving push subscription failed:", error);
    return errorResult(error);
  }
}

export async function subscribeStudentToPush(studentId: string): Promise<SubscribeResult> {
  const id = studentId.trim();
  if (!id) {
    return {
      ok: false,
      reason: "error",
      message: "Your student record is not ready. Reopen Find Your Records and try again.",
    };
  }
  return subscribe((keys) =>
    withTimeout(
      notificationsService.subscribeStudentPush(id, keys),
      "Timed out while saving the push subscription. Please try again.",
    ),
  );
}

export const subscribeOfficerToPush = (): Promise<SubscribeResult> =>
  subscribe((keys) => notificationsService.subscribeOfficerPush(keys));

export const subscribeAnonymousToPush = (): Promise<SubscribeResult> =>
  subscribe((keys) => notificationsService.subscribeAnonymousPush(keys));

/** Re-links an already-subscribed browser to a newly verified student (no new prompt); never throws. */
export async function upgradeSubscriptionToStudent(studentId: string): Promise<void> {
  const id = studentId.trim();
  if (!id) return;
  try {
    const subscription = await getExistingSubscription();
    if (!subscription) return;
    await withTimeout(
      notificationsService.subscribeStudentPush(id, toKeys(subscription)),
      "Timed out while linking the push subscription to the student record.",
    );
  } catch (error) {
    console.error("Failed to upgrade push subscription to student:", error);
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  await withTimeout(subscription.unsubscribe(), "Timed out while disabling push notifications.");
  await withTimeout(
    notificationsService.unsubscribePush(subscription.endpoint),
    "Timed out while removing the push subscription from the server.",
  );
}
