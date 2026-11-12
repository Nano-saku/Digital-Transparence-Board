import { HeartHandshake, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { LscOfficer, Student, UserRole } from "@/types";
import { eventVolunteersService, eventsService, formatLscPositions } from "@/services/db";
import { useLiveData } from "@/hooks/useLiveData";
import RecordHero, { VolunteerStatus } from "@/components/RecordHero";
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

/** The dedicated record view shown only after App verifies an appointment. */
export default function OfficerRecordSection({ student, appointments, onBack, currentUserId, currentUserRole }: OfficerRecordSectionProps) {
  // Realtime refresh (reconnect-safe) for volunteer/event updates.
  const { data, loading } = useLiveData({
    sources: { events: () => eventsService.getAll(), volunteers: () => eventVolunteersService.getByStudentId(student.studentId) },
    tables: ["event_volunteers", "events"],
    channel: `officer-record-${student.id}`,
    deps: [student.studentId],
    onError: () => toast.error("Failed to load officer activities"),
  });
  const volunteers = data?.volunteers ?? [];
  const eventName = (eventId: string, fallback?: string) => data?.events.find((e) => e.id === eventId)?.name ?? fallback ?? "Campus Event";
  const positions = [...new Set(appointments.flatMap((a) => a.positions))].join(" / ") || formatLscPositions(appointments[0]?.positions);

  return (
    <Page
      eyebrow="Verified LSC officer record"
      title="Your officer record"
      subtitle="Your council appointment and the event engagements assigned to you."
      onBack={onBack}
      hero={
        <RecordHero
          student={student}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          qrTitle="Download your attendance QR code"
          subtitle={
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-powder">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {positions}
            </p>
          }
        />
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
                    <p className="truncate font-semibold text-ink">{eventName(v.eventId, v.eventName)}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      Role / task: <span className="font-medium text-ink">{v.roleOrTask}</span>
                    </p>
                  </div>
                  <VolunteerStatus status={v.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Page>
  );
}
