import { useState, type ReactNode } from "react";
import { QrCode } from "lucide-react";
import type { EventVolunteer, Student, UserRole } from "@/types";
import { getOrdinalSuffix } from "@/lib/format";
import { canAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";
import StudentQrModal from "@/components/StudentQrModal";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";

const VOLUNTEER_CHIP: Record<EventVolunteer["status"], string> = {
  assigned: "chip-neutral",
  active: "chip-brand",
  completed: "chip-success",
};

/** Status chip of an event volunteer assignment. */
export function VolunteerStatus({ status }: { status: EventVolunteer["status"] }) {
  return <span className={`chip capitalize ${VOLUNTEER_CHIP[status] ?? "chip-neutral"}`}>{status || "assigned"}</span>;
}

interface RecordHeroProps {
  student: Student;
  currentUserId?: string;
  currentUserRole?: UserRole | null;
  qrTitle: string;
  /** Line under the name (e.g. the officer's positions). */
  subtitle?: ReactNode;
  /** Extra chips after the student details. */
  chips?: ReactNode;
}

/** Hero card of the public record pages: photo, name, class details and the attendance QR pass. */
export default function RecordHero({ student, currentUserId, currentUserRole, qrTitle, subtitle, chips }: RecordHeroProps) {
  const [showQr, setShowQr] = useState(false);
  // Records staff (admin, secretary) or the student themself may change the photo.
  const canEditPhoto = !!canAccess(currentUserRole ?? null, "student-management") || (!!currentUserId && currentUserId === student.accountUserId);
  const details = [student.studentId, student.program, `${student.yearLevel}${getOrdinalSuffix(student.yearLevel)} Year · Section ${student.section}`];

  return (
    <div className="glass flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
      <ProfilePhotoUploader
        studentId={student.id}
        photoUrl={student.profilePhotoUrl}
        name={student.name}
        editable={canEditPhoto}
        sizeClassName="h-20 w-20"
        className="bg-white/15 text-white ring-white/25"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-bold sm:text-2xl">{student.name}</p>
        {subtitle}
        <div className={cn("flex flex-wrap gap-2", subtitle ? "mt-3" : "mt-2")}>
          {details.map((d) => (
            <span key={d} className="chip bg-white/10 font-medium text-white/85">
              {d}
            </span>
          ))}
          {chips}
        </div>
      </div>
      <button onClick={() => setShowQr(true)} className="btn btn-light self-start sm:self-center" title={qrTitle}>
        <QrCode className="h-4 w-4" /> My QR code
      </button>
      <StudentQrModal student={showQr ? student : null} onClose={() => setShowQr(false)} />
    </div>
  );
}
