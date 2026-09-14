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
  return navigator.serviceWorker.register("/sw.js");
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
}

async function subscribeBrowser(): Promise<
  { subscription: PushSubscription } | SubscribeResult
> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set.");
    return { ok: false, reason: "no-vapid-key" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    return { ok: false, reason: "permission-denied" };

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
    return { ok: false, reason: "error" };
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

  await notificationsService.subscribeStudentPush(
    studentId,
    toKeys(result.subscription),
  );
  return { ok: true };
}

export async function subscribeOfficerToPush(): Promise<SubscribeResult> {
  const result = await subscribeBrowser();
  if (!("subscription" in result)) return result;

  await notificationsService.subscribeOfficerPush(toKeys(result.subscription));
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await notificationsService.unsubscribePush(endpoint);
}
