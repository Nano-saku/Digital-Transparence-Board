import { offlineSyncService } from "../../lib/offlineSync";
import type { FeedbackItem } from "../../types";
import { buildAudit, defineTable, field, newId, nowIso, opt, readOnly, sb, unwrap, DESC } from "./core";

const feedback = defineTable<FeedbackItem>({
  name: "feedback",
  entity: "feedback",
  columns: {
    type: "type",
    title: opt("title"),
    message: "message",
    studentName: opt("student_name"),
    studentId: opt("student_id"),
    isAnonymous: "is_anonymous",
    submittedAt: readOnly(field("submitted_at")),
    status: "status",
  },
  order: [["submitted_at", DESC]],
});

export const feedbackService = {
  getAll: (): Promise<FeedbackItem[]> => feedback.getAll(),

  async getByStatus(status: FeedbackItem["status"]): Promise<FeedbackItem[]> {
    return (await feedback.getAll())
      .filter((item) => item.status === status)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  },

  // Inserts without reading the row back and without an optimistic local
  // record: an offline-queued submission shows up after it replays. Students
  // (not officers) always take the direct online path.
  async create(item: Omit<FeedbackItem, "id" | "submittedAt">): Promise<void> {
    const id = newId();
    const payload = {
      type: item.type,
      title: item.title || null,
      message: item.message,
      student_name: item.studentName || null,
      student_id: item.studentId || null,
      is_anonymous: item.isAnonymous,
      submitted_at: nowIso(),
      status: item.status ?? "pending",
    };
    await offlineSyncService.mutation<void>({
      table: "feedback",
      kind: "create",
      recordId: id,
      payload,
      executeOnline: async () => {
        const { error } = await sb().from("feedback").insert({ id, ...payload });
        if (error) {
          console.error("Feedback insert error:", error);
          throw error;
        }
      },
    });
  },

  update: (id: string, item: Partial<FeedbackItem>): Promise<FeedbackItem> => feedback.update(id, item),

  delete: (id: string): Promise<void> => feedback.delete(id),

  async updateStatus(id: string, status: FeedbackItem["status"]): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "feedback",
      kind: "update",
      recordId: id,
      payload: { status },
      audit: await buildAudit(
        "FEEDBACK_STATUS_UPDATED",
        "feedback",
        `Updated feedback status for record ${id} to ${status}.`,
        id,
        { status },
      ),
      executeOnline: async () => {
        await unwrap(sb().from("feedback").update({ status }).eq("id", id));
      },
    });
  },
};
