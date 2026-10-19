import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  HeartHandshake,
  QrCode,
  ShieldCheck,
  User,
} from "lucide-react";
import type { Event, EventVolunteer, LscOfficer, Student } from "@/types";
import {
  eventVolunteersService,
  eventsService,
  formatLscPositions,
  subscribeToTables,
} from "@/services/db";
import StudentQrModal from "@/components/StudentQrModal";
import SectionBackButton from "@/components/SectionBackButton";
import SectionLoader from "@/components/SectionLoader";
import AnimatedNetwork from "@/components/ui/animated-network";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import { getOrdinalSuffix } from "@/lib/format";
import { toast } from "sonner";

interface OfficerRecordSectionProps {
  student: Student;
  appointments: LscOfficer[];
  onBack: () => void;
}

/** The dedicated record view shown only after App verifies an appointment. */
export default function OfficerRecordSection({
  student,
  appointments,
  onBack,
}: OfficerRecordSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [qrStudent, setQrStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      const [eventsData, volunteersData] = await Promise.all([
        eventsService.getAll(),
        eventVolunteersService.getByStudentId(student.studentId),
      ]);
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
    return subscribeToTables(
      ["event_volunteers", "events"],
      () => void loadActivities(),
      `officer-record-${student.id}`,
    );
  }, [loadActivities, student.id]);

  useSectionEntrance(sectionRef, [
    {
      ref: profileRef,
      from: { x: "-60vw", opacity: 0 },
      to: { x: 0, opacity: 1, duration: 0.8 },
    },
  ]);

  const positionLabel = useMemo(
    () =>
      appointments
        .flatMap((appointment) => appointment.positions)
        .filter((position, index, all) => all.indexOf(position) === index)
        .join(" / "),
    [appointments],
  );
  const profileFileReference = useMemo(
    () => appointments.find((appointment) => appointment.previewFileReference)?.previewFileReference,
    [appointments],
  );

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <AnimatedNetwork nodeCount={45} maxEdgeDistance={150} speed={0.3} />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="mb-6">
          <SectionBackButton onClick={onBack} label="Back to Search" />
        </div>

        {loading ? (
          <SectionLoader message="Loading officer activities..." variant="detail" />
        ) : (
          <>
            <div ref={profileRef} className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-red/10 flex items-center justify-center shrink-0">
                    {profileFileReference ? (
                      <img
                        src={profileFileReference}
                        alt={`${student.name}'s selected LSC profile`}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <User className="w-8 h-8 text-red" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary uppercase tracking-wider">
                      Verified LSC Officer Record
                    </p>
                    <h2 className="font-display font-bold text-2xl text-dark">
                      {student.name}
                    </h2>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary mt-1">
                      <span>{student.studentId}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {student.program}
                      </span>
                      <span>
                        {student.yearLevel}
                        {getOrdinalSuffix(student.yearLevel)} Year - Section {student.section}
                      </span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                      <ShieldCheck className="h-4 w-4 text-amber-600" />
                      {positionLabel || formatLscPositions(appointments[0]?.positions)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setQrStudent(student)}
                  className="glass-button px-4 py-2.5 flex items-center gap-2 text-sm"
                  title="Download your attendance QR code"
                >
                  <QrCode className="w-4 h-4" />
                  QR Code
                </button>
              </div>
            </div>

            {volunteers.length > 0 && (
              <div className="glass-card p-5 lg:p-6 mb-8 border border-primary-500/30 bg-white/70">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center">
                    <HeartHandshake className="w-5 h-5 text-primary-500" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg text-dark">
                      Volunteer Activities
                    </h3>
                    <p className="text-xs text-text-secondary">
                      Assigned event engagements ({volunteers.length})
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {volunteers.map((volunteer) => {
                    const event = events.find((item) => item.id === volunteer.eventId);
                    return (
                      <div
                        key={volunteer.id}
                        className="flex items-start justify-between gap-2 p-3 rounded-lg bg-white/80 border border-white/90 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-dark truncate">
                            {event?.name ?? volunteer.eventName ?? "Campus Event"}
                          </p>
                          <p className="text-text-secondary mt-0.5">
                            Role / Task: <span className="font-medium text-dark">{volunteer.roleOrTask}</span>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 shrink-0 capitalize">
                          {volunteer.status || "Assigned"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />
    </section>
  );
}