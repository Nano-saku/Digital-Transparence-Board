import { notificationsService } from "@/services/notificationsService";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;
const SERVICE_WORKER_TIMEOUT_MS = 12_000;
const PUSH_OPERATION_TIMEOUT_MS = 12_000;
const DATABASE_SYNC_TIMEOUT_MS = 12_000;

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

/** Converts the base64url VAPID public key into the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await withTimeout(
    navigator.serviceWorker.getRegistration(),
    SERVICE_WORKER_TIMEOUT_MS,
    "Timed out while checking the notification service worker.",
  );
  const registration =
    existing ??
    (await withTimeout(
      navigator.serviceWorker.register("/sw.js"),
      SERVICE_WORKER_TIMEOUT_MS,
      "Unable to register the notification service worker.",
    ));

  if (registration.active) return registration;

  // A service worker can remain installing/waiting indefinitely on slow or
  // misconfigured deployments. Never allow that state to block the UI forever.
  const readyRegistration = await withTimeout(
    navigator.serviceWorker.ready,
    SERVICE_WORKER_TIMEOUT_MS,
    "Notification service worker did not become ready. Please refresh and try again.",
  );

  if (!readyRegistration.active) {
    throw new Error("Notification service worker is not active yet.");
  }

  return readyRegistration;
}

/** Null if never subscribed on this browser, otherwise the existing PushSubscription. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  return withTimeout(
    registration.pushManager.getSubscription(),
    PUSH_OPERATION_TIMEOUT_MS,
    "Timed out while checking the existing push subscription.",
  );
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

  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      return {
        ok: false,
        reason: "permission-denied",
        message:
          "Notification permission is blocked. Enable it in your browser's site settings, then try again.",
      };
    }

    const registration = await getRegistration();
    const existing = await withTimeout(
      registration.pushManager.getSubscription(),
      PUSH_OPERATION_TIMEOUT_MS,
      "Timed out while checking the existing push subscription.",
    );
    const subscription =
      existing ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast needed on newer TS lib versions: Uint8Array.from()/new Uint8Array()
          // type as Uint8Array<ArrayBufferLike>, but PushManager's typings still
          // want the older, stricter BufferSource shape. Runtime value is fine either way.
          applicationServerKey: urlBase64ToUint8Array(
            VAPID_PUBLIC_KEY,
          ) as BufferSource,
        }),
        PUSH_OPERATION_TIMEOUT_MS,
        "Timed out while creating the push subscription.",
      ));
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
  const normalizedStudentId = studentId.trim();
  if (!normalizedStudentId) {
    return {
      ok: false,
      reason: "error",
      message: "Your student record is not ready. Reopen Find Your Records and try again.",
    };
  }

  const result = await subscribeBrowser();
  if (!("subscription" in result)) return result;

  try {
    await withTimeout(
      notificationsService.subscribeStudentPush(
        normalizedStudentId,
        toKeys(result.subscription),
      ),
      DATABASE_SYNC_TIMEOUT_MS,
      "Timed out while saving the push subscription. Please try again.",
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
  const normalizedStudentId = studentId.trim();
  if (!normalizedStudentId) return;

  try {
    const subscription = await getExistingSubscription();
    if (!subscription) return;

    await withTimeout(
      notificationsService.subscribeStudentPush(
        normalizedStudentId,
        toKeys(subscription),
      ),
      DATABASE_SYNC_TIMEOUT_MS,
      "Timed out while linking the push subscription to the student record.",
    );
  } catch (error) {
    console.error("Failed to upgrade push subscription to student:", error);
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await withTimeout(
    subscription.unsubscribe(),
    PUSH_OPERATION_TIMEOUT_MS,
    "Timed out while disabling push notifications.",
  );
  await withTimeout(
    notificationsService.unsubscribePush(endpoint),
    DATABASE_SYNC_TIMEOUT_MS,
    "Timed out while removing the push subscription from the server.",
  );
}
