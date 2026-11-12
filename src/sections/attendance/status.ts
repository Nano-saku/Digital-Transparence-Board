import { ClipboardCheck, Moon, Sun, Sunrise, UserCheck, UserX, type LucideIcon } from "lucide-react";
import type { AttendanceRecord, EventSession } from "@/types";

export type Status = AttendanceRecord["status"];
export type ScanMode = "timeIn" | "timeOut";

export const STATUSES: Status[] = ["present", "excuse", "absent"];
export const STATUS: Record<Status, { label: string; chip: string; tone: "success" | "brand" | "danger"; icon: LucideIcon }> = {
  present: { label: "Present", chip: "chip-success", tone: "success", icon: UserCheck },
  excuse: { label: "Excused", chip: "chip-brand", tone: "brand", icon: ClipboardCheck },
  absent: { label: "Absent", chip: "chip-danger", tone: "danger", icon: UserX },
};
export const SESSION_ICON: Record<EventSession, LucideIcon> = { morning: Sunrise, afternoon: Sun, evening: Moon };
export const MODE_LABEL: Record<ScanMode, string> = { timeIn: "Time In", timeOut: "Time Out" };
