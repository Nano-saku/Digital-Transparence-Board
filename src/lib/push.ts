import { notificationsService } from "@/services/notificationsService";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

/** Converts the base64url VAPID public key into the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  // register() can resolve while the worker is still installing — the Push
  // API needs it fully active. .ready resolves once that's actually true.
  await navigator.serviceWorker.ready;
  return registration;
}

/** Null if never subscribed on this browser, otherwise the existing PushSubscription. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready.catch(() =>
    getRegistration(),
  );
  return registration.pushManager.getSubscription();
}

interface SubscribeResult {
  ok: boolean;
  reason?: "unsupported" | "permission-denied" | "no-vapid-key" | "error";
  message?: string;
}

async function subscribeBrowser(): Promise<
  { subscription: PushSubscription } | SubscribeResult
> {
  if (!isPushSupported()) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Push isn't supported in this browser.",
    };
  }
  if (!VAPID_PUBLIC_KEY) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set.");
    return {
      ok: false,
      reason: "no-vapid-key",
      message: "Missing VAPID public key configuration.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "permission-denied",
      message: "Notification permission was denied.",
    };
  }

  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast needed on newer TS lib versions: Uint8Array.from()/new Uint8Array()
      // type as Uint8Array<ArrayBufferLike>, but PushManager's typings still
      // want the older, stricter BufferSource shape. Runtime value is fine either way.
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY,
      ) as BufferSource,
    });
    return { subscription };
  } catch (error) {
    console.error("Push subscribe failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message };
  }
}

function toKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    authKey: json.keys?.auth ?? "",
  };
}

export async function subscribeStudentToPush(
  studentId: string,
): Promise<SubscribeResult> {
  const result = await subscribeBrowser();
  if (!("subscription" in result)) return result;

  try {
    await notificationsService.subscribeStudentPush(
      studentId,
      toKeys(result.subscription),
    );
    return { ok: true };
  } catch (error) {
    console.error("Saving push subscription failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message };
  }
}

export async function subscribeOfficerToPush(): Promise<SubscribeResult> {
  const result = await subscribeBrowser();
  if (!("subscription" in result)) return result;

  try {
    await notificationsService.subscribeOfficerPush(
      toKeys(result.subscription),
    );
    return { ok: true };
  } catch (error) {
    console.error("Saving push subscription failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message };
  }
}

export async function subscribeAnonymousToPush(): Promise<SubscribeResult> {
  const result = await subscribeBrowser();
  if (!("subscription" in result)) return result;

  try {
    await notificationsService.subscribeAnonymousPush(
      toKeys(result.subscription),
    );
    return { ok: true };
  } catch (error) {
    console.error("Saving push subscription failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "error", message };
  }
}

/**
 * Silently re-links an already-subscribed browser to a newly-verified
 * student — no new permission prompt, permission was already granted.
 * No-op if this browser was never subscribed in the first place.
 */
export async function upgradeSubscriptionToStudent(
  studentId: string,
): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  try {
    await notificationsService.subscribeStudentPush(
      studentId,
      toKeys(subscription),
    );
  } catch (error) {
    console.error("Failed to upgrade push subscription to student:", error);
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await notificationsService.unsubscribePush(endpoint);
}
