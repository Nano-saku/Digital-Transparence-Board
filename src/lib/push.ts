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
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Register the push service worker and WAIT until it is active.
 *
 * Important:
 * navigator.serviceWorker.register() returning successfully does NOT
 * guarantee that the worker is active yet.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  // If the service worker is already active, this resolves immediately.
  // Otherwise it waits until the worker reaches the active state.
  if (registration.active) {
    return registration;
  }

  return navigator.serviceWorker.ready;
}

/**
 * Gets the existing PushSubscription for this browser.
 *
 * Returns null if the user has never subscribed.
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await getRegistration();

    return registration.pushManager.getSubscription();
  } catch (error) {
    console.error("Failed to get push subscription:", error);
    return null;
  }
}

interface SubscribeResult {
  ok: boolean;
  reason?: "unsupported" | "permission-denied" | "no-vapid-key" | "error";
}

async function subscribeBrowser(): Promise<
  { subscription: PushSubscription } | SubscribeResult
> {
  if (!isPushSupported()) {
    return {
      ok: false,
      reason: "unsupported",
    };
  }

  if (!VAPID_PUBLIC_KEY) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set.");

    return {
      ok: false,
      reason: "no-vapid-key",
    };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      reason: "permission-denied",
    };
  }

  try {
    /**
     * IMPORTANT:
     * getRegistration() now waits for an ACTIVE service worker.
     */
    const registration = await getRegistration();

    console.log("Push service worker ready:", registration.active?.scriptURL);

    /**
     * Reuse an existing subscription if one already exists.
     */
    const existingSubscription =
      await registration.pushManager.getSubscription();

    if (existingSubscription) {
      console.log("Using existing push subscription.");

      return {
        subscription: existingSubscription,
      };
    }

    /**
     * Only subscribe AFTER the service worker is active.
     */
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,

      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY,
      ) as BufferSource,
    });

    console.log("Push subscription created successfully.");

    return {
      subscription,
    };
  } catch (error) {
    console.error("Push subscribe failed:", error);

    return {
      ok: false,
      reason: "error",
    };
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

  if (!("subscription" in result)) {
    return result;
  }

  await notificationsService.subscribeStudentPush(
    studentId,
    toKeys(result.subscription),
  );

  return {
    ok: true,
  };
}

export async function subscribeOfficerToPush(): Promise<SubscribeResult> {
  const result = await subscribeBrowser();

  if (!("subscription" in result)) {
    return result;
  }

  await notificationsService.subscribeOfficerPush(toKeys(result.subscription));

  return {
    ok: true,
  };
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  await notificationsService.unsubscribePush(endpoint);
}
