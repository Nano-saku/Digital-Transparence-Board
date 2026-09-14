import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { studentsService } from "@/services/db";
import { notificationsService } from "@/services/notificationsService";

interface SendNotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RecipientOption = "all_students" | "all_officers" | "student";

/** Staff-only compose modal — the INSERT is also gated server-side by public.is_staff(). */
export default function SendNotificationModal({ open, onOpenChange }: SendNotificationModalProps) {
  const [recipient, setRecipient] = useState<RecipientOption>("all_students");
  const [studentIdInput, setStudentIdInput] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  function reset() {
    setRecipient("all_students");
    setStudentIdInput("");
    setTitle("");
    setBody("");
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      toast.error("Please fill in both a title and a message.");
      return;
    }

    if (recipient === "student" && !studentIdInput.trim()) {
      toast.error("Enter the student's Student ID.");
      return;
    }

    try {
      setSending(true);

      let recipientStudentId: string | undefined;

      if (recipient === "student") {
        const student = await studentsService.getByStudentId(studentIdInput.trim());
        if (!student) {
          toast.error("No student found with that Student ID.");
          return;
        }
        recipientStudentId = student.id;
      }

      await notificationsService.sendAnnouncement({
        recipientKind: recipient,
        recipientStudentId,
        title: title.trim(),
        body: body.trim(),
      });

      toast.success("Notification sent.");
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to send notification:", error);
      toast.error("Failed to send notification.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl text-dark">
            Send Notification
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium text-dark mb-1.5">Send to</label>
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value as RecipientOption)}
              className="glass-input w-full px-4 py-2"
            >
              <option value="all_students">All students</option>
              <option value="all_officers">All officers</option>
              <option value="student">A specific student</option>
            </select>
          </div>

          {recipient === "student" && (
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Student ID</label>
              <input
                type="text"
                value={studentIdInput}
                onChange={(e) => setStudentIdInput(e.target.value)}
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., 2023-00123"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input w-full px-4 py-2"
              placeholder="e.g., General Assembly rescheduled"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="glass-input w-full px-4 py-2 min-h-[90px]"
              placeholder="Write the notification message..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 glass-button px-4 py-2.5"
              disabled={sending}
            >
              Cancel
            </button>

            <button
              onClick={handleSend}
              className="flex-1 btn-primary px-4 py-2.5"
              disabled={sending}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
