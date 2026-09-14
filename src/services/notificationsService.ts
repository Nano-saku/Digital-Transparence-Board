import { getSupabase } from "../lib/supabase";

const createRecordId = (): string => crypto.randomUUID();

export type NotificationType = "payment" | "file" | "deadline" | "announcement";
export type RecipientKind =
  | "officer"
  | "all_officers"
  | "student"
  | "all_students";

export interface AppNotification {
  id: string;
  recipientKind: RecipientKind;
  recipientUserId: string | null;
  recipientStudentId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  recipient_kind: RecipientKind;
  recipient_user_id: string | null;
  recipient_student_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function fromRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    recipientKind: row.recipient_kind,
    recipientUserId: row.recipient_user_id,
    recipientStudentId: row.recipient_student_id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

// ============================================
// OFFICER SIDE — real auth.uid(), RLS-gated
// ============================================

/** RLS already limits this to the signed-in officer's own rows + all_officers broadcasts. */
async function getForOfficer(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as NotificationRow[]).map(fromRow);
}

async function getUnreadCountForOfficer(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

async function markAsRead(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

async function markAllReadForOfficer(): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw error;
}

/** Realtime for the officer bell — mirrors subscribeToTables in db.ts. */
function subscribeOfficer(onInsert: (n: AppNotification) => void): () => void {
  const sb = getSupabase();
  const channel = sb.channel(`notifications-officer-${createRecordId()}`);

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications" },
    (payload) => onInsert(fromRow(payload.new as NotificationRow)),
  );

  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

// ============================================
// STUDENT SIDE — no login; public rows filtered
// client-side by whichever student record is open.
// No persisted read state (no identity to attach it to).
// ============================================

async function getForStudent(
  studentId: string,
  limit = 20,
): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .or(
      `recipient_kind.eq.all_students,and(recipient_kind.eq.student,recipient_student_id.eq.${studentId})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as NotificationRow[]).map(fromRow);
}

function subscribeStudent(
  studentId: string,
  onInsert: (n: AppNotification) => void,
): () => void {
  const sb = getSupabase();
  const channel = sb.channel(`notifications-student-${createRecordId()}`);

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications" },
    (payload) => {
      const row = payload.new as NotificationRow;
      const relevant =
        row.recipient_kind === "all_students" ||
        (row.recipient_kind === "student" &&
          row.recipient_student_id === studentId);
      if (relevant) onInsert(fromRow(row));
    },
  );

  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

// ============================================
// PUBLIC SIDE — no login at all, any visitor.
// Broadcasts only (never a specific student's own
// payment/deadline rows) — those still need the
// per-student query above, scoped to one record.
// ============================================

async function getPublicBroadcasts(limit = 20): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from("notifications")
    .select("*")
    .eq("recipient_kind", "all_students")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as NotificationRow[]).map(fromRow);
}

function subscribePublicBroadcasts(
  onInsert: (n: AppNotification) => void,
): () => void {
  const sb = getSupabase();
  const channel = sb.channel(`notifications-public-${createRecordId()}`);

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications" },
    (payload) => {
      const row = payload.new as NotificationRow;
      if (row.recipient_kind === "all_students") onInsert(fromRow(row));
    },
  );

  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

// ============================================
// PUSH SUBSCRIPTIONS
// ============================================

interface PushKeys {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

async function subscribeOfficerPush(keys: PushKeys): Promise<void> {
  const { data: userData, error: userError } =
    await getSupabase().auth.getUser();
  if (userError) throw userError;
  if (!userData.user)
    throw new Error("Must be signed in to subscribe to push notifications.");

  // Delete-then-insert rather than upsert: this endpoint may currently
  // belong to a different subscriber_kind row (same browser, different
  // identity earlier), and there's no UPDATE policy to transfer it —
  // deleting by endpoint is allowed for anyone who has that endpoint,
  // which only the owning browser ever does.
  await getSupabase()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", keys.endpoint);

  const { error } = await getSupabase().from("push_subscriptions").insert({
    id: createRecordId(),
    subscriber_kind: "officer",
    officer_user_id: userData.user.id,
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth_key: keys.authKey,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function subscribeStudentPush(
  studentId: string,
  keys: PushKeys,
): Promise<void> {
  await getSupabase()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", keys.endpoint);

  const { error } = await getSupabase().from("push_subscriptions").insert({
    id: createRecordId(),
    subscriber_kind: "student",
    student_id: studentId,
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth_key: keys.authKey,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function unsubscribePush(endpoint: string): Promise<void> {
  const { error } = await getSupabase()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) throw error;
}

// ============================================
// MANUAL SEND — staff only (public.is_staff()),
// enforced by the INSERT policy, not just this function.
// ============================================

interface SendAnnouncementInput {
  recipientKind: Extract<
    RecipientKind,
    "all_students" | "all_officers" | "student"
  >;
  /** Required when recipientKind === "student" — the internal students.id. */
  recipientStudentId?: string;
  title: string;
  body: string;
}

async function sendAnnouncement(input: SendAnnouncementInput): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .insert({
      id: createRecordId(),
      recipient_kind: input.recipientKind,
      recipient_student_id:
        input.recipientKind === "student"
          ? (input.recipientStudentId ?? null)
          : null,
      type: "announcement",
      title: input.title,
      body: input.body,
      link: null,
      created_at: new Date().toISOString(),
    });

  if (error) throw error;
}

async function deleteNotification(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function subscribeAnonymousPush(keys: PushKeys): Promise<void> {
  await getSupabase()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", keys.endpoint);

  const { error } = await getSupabase().from("push_subscriptions").insert({
    id: createRecordId(),
    subscriber_kind: "anonymous",
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth_key: keys.authKey,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export const notificationsService = {
  getForOfficer,
  getUnreadCountForOfficer,
  markAsRead,
  markAllReadForOfficer,
  subscribeOfficer,
  getForStudent,
  subscribeStudent,
  getPublicBroadcasts,
  subscribePublicBroadcasts,
  sendAnnouncement,
  deleteNotification,
  subscribeOfficerPush,
  subscribeStudentPush,
  subscribeAnonymousPush,
  unsubscribePush,
};
