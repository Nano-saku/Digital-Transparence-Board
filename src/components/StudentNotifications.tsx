import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  notificationsService,
  type AppNotification,
} from "@/services/notificationsService";

interface StudentNotificationsProps {
  /** The internal students.id of the record currently being viewed. */
  studentId: string;
}

/**
 * Alerts relevant to one student's record — payment confirmations,
 * newly published requirement files, upcoming contribution deadlines.
 * There's no student login, so this is just a live view of public rows,
 * not a personal inbox: nothing here is confidential (the same data is
 * already visible on the record page itself).
 */
export default function StudentNotifications({
  studentId,
}: StudentNotificationsProps) {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    notificationsService
      .getForStudent(studentId)
      .then(setItems)
      .catch((error) => console.error("Failed to load notifications:", error));

    return notificationsService.subscribeStudent(studentId, (n) =>
      setItems((prev) =>
        prev.some((item) => item.id === n.id) ? prev : [n, ...prev],
      ),
    );
  }, [studentId]);

  if (items.length === 0) return null;

  return (
    <div className="dssc-card p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-royal-blue" />
        <span className="text-sm font-semibold text-foreground">Updates</span>
      </div>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className="text-sm">
            <span className="font-medium text-foreground">{n.title}</span>
            <span className="text-text-secondary"> — {n.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
