import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarClock, Clock } from "lucide-react";
import type { Event, EventSchedule } from "@/types";
import { eventsService } from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { EVENT_SESSION_LABELS } from "@/lib/attendance";
import { formatDate, formatTime12, parseCalendarDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import Skeleton from "@/components/ui/Skeleton";

const scheduleLabel = ({ period, timeIn, timeOut }: EventSchedule) => {
  const time = timeIn || timeOut ? [timeIn && formatTime12(timeIn), timeOut && formatTime12(timeOut)].filter(Boolean).join(" – ") : "Time TBD";
  return `${EVENT_SESSION_LABELS[period]}: ${time}`;
};

/** Session times of an event, falling back to its legacy single start/end time. */
function eventTimes(event: Event): string[] {
  if (event.schedules?.length) return event.schedules.map(scheduleLabel);
  if (!event.timeIn && !event.timeOut) return [];
  return [[event.timeIn && `Start ${formatTime12(event.timeIn)}`, event.timeOut && `End ${formatTime12(event.timeOut)}`].filter(Boolean).join(" · ")];
}

function DateTile({ date }: { date?: string }) {
  const parsed = date ? parseCalendarDate(date) : null;
  return (
    <div className="grid h-14 w-14 shrink-0 place-content-center rounded-2xl bg-brand-600 text-center text-white">
      <span className="text-[10px] font-bold uppercase leading-none tracking-wider text-white/75">
        {parsed ? parsed.toLocaleDateString("en-US", { month: "short" }) : "TBD"}
      </span>
      {parsed && <span className="mt-1 text-xl font-extrabold leading-none">{parsed.getDate()}</span>}
    </div>
  );
}

/** One scheduled event: date tile, name, session times, plus optional extra content. */
export function EventCard({ event, className, children }: { event: Event; className?: string; children?: ReactNode }) {
  const times = eventTimes(event);
  return (
    <article className={cn("flex h-full flex-col p-5", className)}>
      <div className="flex items-start gap-4">
        <DateTile date={event.date} />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-snug text-ink">{event.name}</h3>
          <p className="mt-1 text-sm text-muted">{event.date ? formatDate(event.date) : "Date to be announced"}</p>
        </div>
      </div>
      {times.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm text-muted">
          {times.map((time) => (
            <li key={time} className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden /> {time}
            </li>
          ))}
        </ul>
      )}
      {children}
    </article>
  );
}

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

  const message = loadFailed
    ? "Upcoming events are unavailable right now. Please try again shortly."
    : "No upcoming LSC events are scheduled right now.";

  return (
    <section id="upcoming-events" aria-labelledby="upcoming-events-heading" className="bg-page px-4 pt-20 sm:px-6 lg:pt-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="upcoming-events-heading" className="text-2xl font-extrabold sm:text-3xl">
            Upcoming events
          </h2>
          <p className="text-sm text-muted">Nearest first</p>
        </div>

        {loading ? (
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading upcoming events">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card flex gap-4 p-5">
                <Skeleton className="h-14 w-14 rounded-2xl" />
                <div className="flex-1 space-y-2.5 pt-1">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="mt-6 h-3.5 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : loadFailed || events.length === 0 ? (
          <div className="card mx-auto mt-14 flex max-w-2xl flex-col items-center p-8 text-center">
            <span className="icon-tile mb-4 h-14 w-14">
              <CalendarClock className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted" role={loadFailed ? "alert" : undefined}>
              {message}
            </p>
          </div>
        ) : (
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} className="card hover:-translate-y-1 hover:shadow-lift" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
