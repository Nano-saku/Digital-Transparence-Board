import { useCallback, useEffect, useMemo, useState } from "react";
import { HeartHandshake, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Event, EventVolunteer, LscOfficer, Student, UserRole } from "@/types";
import { eventVolunteersService, eventsService, formatLscPositions } from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { getOrdinalSuffix } from "@/lib/format";
import StudentQrModal from "@/components/StudentQrModal";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import Page from "@/components/ui/Page";
import EmptyState from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/Skeleton";

interface OfficerRecordSectionProps {
  student: Student;
  appointments: LscOfficer[];
  onBack: () => void;
  currentUserId?: string;
  currentUserRole?: UserRole | null;
}

const VOLUNTEER_CHIP: Record<EventVolunteer["status"], string> = {
  assigned: "chip-neutral",
  active: "chip-brand",
  completed: "chip-success",
};

/** The dedicated record view shown only after App verifies an appointment. */
export default function OfficerRecordSection({ student, appointments, onBack, currentUserId, currentUserRole }: OfficerRecordSectionProps) {
  const [showQr, setShowQr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
  const canEditProfilePhoto =
    currentUserRole === "admin" || currentUserRole === "secretary" || (!!currentUserId && currentUserId === student.accountUserId);

  const loadActivities = useCallback(async () => {
    try {
      const [eventsData, volunteersData] = await Promise.all([eventsService.getAll(), eventVolunteersService.getByStudentId(student.studentId)]);
      setEvents(eventsData);
      setVolunteers(volunteersData);
    } catch (error) {
      console.error("Error loading officer activities:", error);
      toast.error("Failed to load officer activities");
    } finally {
      setLoading(false);
    }
  }, [student.studentId]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  // Reconnection-safe realtime refresh for volunteer/event updates.
  useRealtimeSync({
    tables: ["event_volunteers", "events"],
    onChange: () => void loadActivities(),
    channelPrefix: `officer-record-${student.id}`,
  });

  const positionLabel = useMemo(() => [...new Set(appointments.flatMap((a) => a.positions))].join(" / "), [appointments]);
  const eventName = (v: EventVolunteer) => events.find((e) => e.id === v.eventId)?.name ?? v.eventName ?? "Campus Event";
  const details = [student.studentId, student.program, `${student.yearLevel}${getOrdinalSuffix(student.yearLevel)} Year · Section ${student.section}`];

  return (
    <Page
      eyebrow="Verified LSC officer record"
      title="Your officer record"
      subtitle="Your council appointment and the event engagements assigned to you."
      onBack={onBack}
      hero={
        <div className="glass flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <ProfilePhotoUploader
            studentId={student.id}
            photoUrl={student.profilePhotoUrl}
            name={student.name}
            editable={canEditProfilePhoto}
            sizeClassName="h-20 w-20"
            className="bg-white/15 text-white ring-white/25"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold sm:text-2xl">{student.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-powder">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {positionLabel || formatLscPositions(appointments[0]?.positions)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {details.map((d) => (
                <span key={d} className="chip bg-white/10 font-medium text-white/85">
                  {d}
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => setShowQr(true)} className="btn btn-light self-start sm:self-center" title="Download your attendance QR code">
            <QrCode className="h-4 w-4" /> My QR code
          </button>
        </div>
      }
    >
      {loading ? (
        <LoadingCard rows={4} label="Loading officer activities…" />
      ) : (
        <section className="card overflow-hidden">
          <div className="flex items-center gap-3 p-5">
            <div className="icon-tile">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">Volunteer activities</h2>
              <p className="text-xs text-muted">Assigned event engagements ({volunteers.length})</p>
            </div>
          </div>
          {volunteers.length === 0 ? (
            <EmptyState icon={HeartHandshake} title="No volunteer activities yet" description="Event engagements assigned to you will appear here." />
          ) : (
            <ul className="space-y-2 px-5 pb-5">
              {volunteers.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{eventName(v)}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      Role / task: <span className="font-medium text-ink">{v.roleOrTask}</span>
                    </p>
                  </div>
                  <span className={`chip capitalize ${VOLUNTEER_CHIP[v.status] ?? "chip-neutral"}`}>{v.status || "assigned"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <StudentQrModal student={showQr ? student : null} onClose={() => setShowQr(false)} />
    </Page>
  );
}
