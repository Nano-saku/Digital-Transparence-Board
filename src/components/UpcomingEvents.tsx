import { useCallback, useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import type { Event, EventSchedule } from "@/types";
import { eventsService } from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { formatDate, formatTime12 } from "@/lib/format";
import Skeleton from "@/components/Skeleton";

const scheduleLabel = (schedule: EventSchedule): string => {
  const period =
    schedule.period === "morning"
      ? "Morning"
      : schedule.period === "afternoon"
        ? "Afternoon"
        : "Evening";
  const time =
    schedule.timeIn || schedule.timeOut
      ? `${schedule.timeIn ? formatTime12(schedule.timeIn) : "Time TBD"}${
          schedule.timeIn && schedule.timeOut ? " – " : ""
        }${schedule.timeOut ? formatTime12(schedule.timeOut) : ""}`
      : "Time TBD";

  return `${period}: ${time}`;
};

const EventCard = ({ event }: { event: Event }) => {
  const hasSchedules = Boolean(event.schedules?.length);
  const hasLegacyTime = Boolean(event.timeIn || event.timeOut);

  return (
    <article className="glass-card group h-full p-5 transition duration-300 hover:-translate-y-1 hover:shadow-glass-hover sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Calendar className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow mb-2">Upcoming LSC Event</p>
          <h3 className="font-display text-lg font-bold leading-snug text-theme-heading">
            {event.name}
          </h3>
          <p className="mt-2 text-sm font-medium text-text-secondary">
            {event.date ? formatDate(event.date) : "Date to be announced"}
          </p>
        </div>
      </div>

      {(hasSchedules || hasLegacyTime) && (
        <div className="theme-border mt-5 space-y-2 border-t pt-4 text-sm text-text-secondary">
          {hasSchedules ? (
            event.schedules!.map((schedule) => (
              <p key={schedule.period} className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {scheduleLabel(schedule)}
              </p>
            ))
          ) : (
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {event.timeIn && `Start ${formatTime12(event.timeIn)}`}
              {event.timeIn && event.timeOut && " · "}
              {event.timeOut && `End ${formatTime12(event.timeOut)}`}
            </p>
          )}
        </div>
      )}
    </article>
  );
};

/** Public, automatically refreshed feed of future events from the events catalog. */
export default function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      setLoadFailed(false);
      // Realtime changes must not be hidden by the session reference cache.
      setEvents(await eventsService.getUpcomingForStudents(true));
    } catch (error) {
      console.error("Unable to load upcoming events:", error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useRealtimeSync({
    tables: ["events"],
    onChange: () => void loadEvents(),
    channelPrefix: "upcoming-events",
  });

  return (
    <section
      id="upcoming-events"
      aria-labelledby="upcoming-events-heading"
      className="landing-events-section relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="landing-events-overlay pointer-events-none absolute inset-0" />
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="mb-10 text-center">
          <span className="eyebrow">Stay connected</span>
          <h2
            id="upcoming-events-heading"
            className="landing-section-title mt-3 font-display text-3xl font-bold sm:text-4xl"
          >
            Upcoming Events
          </h2>
          <p className="landing-section-description mx-auto mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
            See what&apos;s coming up.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading upcoming events">
            {[0, 1, 2].map((index) => (
              <div key={index} className="glass-card p-5 sm:p-6">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="mt-4 h-6 w-4/5" />
                <Skeleton className="mt-3 h-4 w-2/5" />
                <Skeleton className="mt-8 h-4 w-3/5" />
              </div>
            ))}
          </div>
        ) : loadFailed ? (
          <p className="glass-card mx-auto max-w-2xl p-6 text-center text-sm text-text-secondary" role="alert">
            Upcoming events are unavailable right now. Please try again shortly.
          </p>
        ) : events.length === 0 ? (
          <p className="glass-card mx-auto max-w-2xl p-6 text-center text-sm text-text-secondary">
            No upcoming LSC events are scheduled right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}