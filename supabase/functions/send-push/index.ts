// supabase/functions/send-push/index.ts
//
// Triggered by a Database Webhook (Database -> Webhooks in the dashboard):
//   Table: notifications, Event: Insert, Type: HTTP Request -> this function's URL
//
// Reads push_subscriptions with the service role key (bypasses RLS, which
// is intentional — that table has no SELECT policy for anon/authenticated,
// only this function is meant to read it) and sends a push to every
// subscription matching the new notification's recipient_kind.
//
// Required secrets (supabase secrets set):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — from generateVAPIDKeys()
//   VAPID_SUBJECT                        — e.g. "mailto:you@example.com"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already available by default.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

interface NotificationRow {
  id: string;
  recipient_kind: "officer" | "all_officers" | "student" | "all_students";
  recipient_user_id: string | null;
  recipient_student_id: string | null;
  title: string;
  body: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const notification: NotificationRow = payload.record;

    let query = supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key");

    switch (notification.recipient_kind) {
      case "officer":
        query = query
          .eq("subscriber_kind", "officer")
          .eq("officer_user_id", notification.recipient_user_id);
        break;
      case "all_officers":
        query = query.eq("subscriber_kind", "officer");
        break;
      case "student":
        query = query
          .eq("subscriber_kind", "student")
          .eq("student_id", notification.recipient_student_id);
        break;
      case "all_students":
        query = query.in("subscriber_kind", ["student", "anonymous"]);
        break;
    }

    const { data, error } = await query;
    if (error) throw error;

    const subs: PushSubscriptionRow[] = data ?? [];

    const payloadJson = JSON.stringify({
      title: notification.title,
      body: notification.body,
    });

    const results = await Promise.allSettled(
      subs.map((sub: PushSubscriptionRow) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payloadJson,
        ),
      ),
    );

    // A 404/410 means the browser dropped the subscription — clean it up
    // so we stop trying to push to a dead endpoint every time.
    const deadIds: string[] = [];
    results.forEach((result: PromiseSettledResult<unknown>, i: number) => {
      if (result.status === "rejected") {
        const statusCode = (result.reason as { statusCode?: number })
          ?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deadIds.push(subs[i].id);
        } else {
          console.error("Push send failed:", result.reason);
        }
      }
    });

    if (deadIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", deadIds);
    }

    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.status === "fulfilled").length,
        total: subs.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-push error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
