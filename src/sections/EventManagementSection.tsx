import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Calendar, CalendarClock, ClipboardCheck, Clock, CloudSun, Moon, Pencil, Plus, Sun, Target, Trash2, UserCheck, Wallet, type LucideIcon } from "lucide-react";
import { boardMembersService, contributionsService, eventsService, financialReportingService } from "@/services/db";
import { notificationsService } from "@/services/notificationsService";
import { useLiveData } from "@/hooks/useLiveData";
import type { Event, EventSchedule, EventSession, UserRole } from "@/types";
import { daysUntil, formatDate, formatPeso, formatTimeRange, getEarliestScheduledTime, parseCalendarDate, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Field from "@/components/ui/Field";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { Menu, MenuContent, MenuItem, MenuSeparator, RowActionsTrigger } from "@/components/ui/Menu";
import TimeInput12 from "@/components/TimeInput12";

interface EventManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  staffName: string;
  userId?: string;
}

const SESSIONS: Record<EventSession, { label: string; icon: LucideIcon }> = {
  morning: { label: "Morning", icon: Sun },
  afternoon: { label: "Afternoon", icon: CloudSun },
  evening: { label: "Evening", icon: Moon },
};

type EventForm = {
  name: string;
  allocationAmount: number;
  isNonConducting: boolean;
  isNoContribution: boolean;
  autoMarkAbsent: boolean;
  date: string;
  tbd: boolean;
  contributionDeadline: string;
  schedules: EventSchedule[];
};

const EMPTY_FORM: EventForm = {
  name: "",
  allocationAmount: 0,
  isNonConducting: false,
  isNoContribution: false,
  autoMarkAbsent: false,
  date: "",
  tbd: false,
  contributionDeadline: "",
  schedules: [],
};

const isTbd = (e: Event) => !e.date || e.date === "TBD";
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : (error as { message?: string })?.message || fallback;

const inDays = (d: number) => (d === 0 ? { label: "Today", tone: "chip-danger" } : { label: `In ${d}d`, tone: d <= 7 ? "chip-warning" : "chip-success" });

/** Countdown to the event's earliest session start, so the day isn't deducted early. */
function eventStatus(event: Event) {
  if (event.isNonConducting) return { label: "Non-conducting", tone: "chip-neutral" };
  if (isTbd(event)) return { label: "Date TBD", tone: "chip-warning" };
  if (event.date! < today()) return { label: "Done", tone: "chip-neutral" };
  return inDays(Math.max(0, daysUntil(event.date!, getEarliestScheduledTime(event.schedules))));
}

const deadlineChip = (date: string) => (daysUntil(date) < 0 ? { label: "Overdue", tone: "chip-danger" } : inDays(daysUntil(date)));

export default function EventManagementSection({ onBack, role }: EventManagementSectionProps) {
  const [saving, setSaving] = useState(false);

  // `editing`: null = closed, "new" = create, Event = edit.
  const [editing, setEditing] = useState<Event | "new" | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [sessionToAdd, setSessionToAdd] = useState<EventSession | "">("");
  const [toDelete, setToDelete] = useState<Event | null>(null);
  const [evaluating, setEvaluating] = useState<Event | null>(null);
  const [formUrl, setFormUrl] = useState("");

  const canManage = role === "admin" || role === "board-member";

  // Live updates (reconnect-safe) for officer exemptions, allocations and collections;
  // a burst of changes keeps only the newest response.
  const { data, loading, mutate } = useLiveData({
    sources: { events: () => eventsService.getAll() },
    optional: {
      collected: () => contributionsService.getTotalsByEvent(),
      // Expected collection comes from the financial report so currently
      // appointed LSC officers are excluded.
      report: () => financialReportingService.getReport(),
      boardMembers: () => boardMembersService.listBoardMembers(),
    },
    tables: ["events", "students", "lsc_officers", "contributions", "board_members"],
    channel: "event-management",
    onError: () => !data && toast.error("Failed to load data"),
  });
  const events = data?.events ?? [];
  const collected: Record<string, number> = data?.collected ?? {};
  const expected: Record<string, number> = Object.fromEntries(
    (data?.report?.eventAllocations ?? []).filter((a) => a.expectedAmount != null).map((a) => [a.eventId, Number(a.expectedAmount)]),
  );

  // Dated events soonest first, then TBD / non-conducting events alphabetically.
  const sortedEvents = [...events].sort((a, b) =>
    isTbd(a) !== isTbd(b) ? (isTbd(a) ? 1 : -1) : isTbd(a) ? a.name.localeCompare(b.name) : a.date!.localeCompare(b.date!),
  );

  const replaceEvent = (id: string, patch: Partial<Event>) => mutate("events", (prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const patchForm = (patch: Partial<EventForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const updateSchedule = (period: EventSession, patch: Partial<EventSchedule>) =>
    patchForm({ schedules: form.schedules.map((s) => (s.period === period ? { ...s, ...patch } : s)) });

  // Existing assignments are kept; otherwise every board member oversees the event.
  const assignedMembers =
    editing && editing !== "new" && editing.assignedMembers?.length
      ? editing.assignedMembers
      : (data?.boardMembers ?? []).map((m) => ({ memberId: m.id, memberName: m.name }));

  const openForm = (event?: Event) => {
    setEditing(event ?? "new");
    setSessionToAdd("");
    setForm(
      event
        ? {
            name: event.name,
            allocationAmount: event.allocationAmount,
            isNonConducting: event.isNonConducting ?? false,
            isNoContribution: event.isNoContribution ?? false,
            autoMarkAbsent: event.autoMarkAbsent ?? false,
            date: isTbd(event) ? "" : event.date!,
            tbd: isTbd(event),
            contributionDeadline: event.contributionDeadline ?? "",
            schedules: event.schedules ?? [],
          }
        : EMPTY_FORM,
    );
  };

  const addSession = () => {
    if (!sessionToAdd) return;
    if (form.schedules.some((s) => s.period === sessionToAdd)) return void toast.error("This schedule has already been added");
    patchForm({ schedules: [...form.schedules, { period: sessionToAdd, timeInEnabled: true, timeOutEnabled: true, timeIn: "", timeOut: "" }] });
    setSessionToAdd("");
  };

  const saveEvent = async () => {
    if (!editing || saving) return;
    const name = form.name.trim();
    if (!name) return void toast.error("Please enter an event name.");
    if (!form.isNonConducting && !form.tbd && !form.date)
      return void toast.error("Please specify an event date or mark date as To Be Determined.");
    if (editing === "new" && events.some((e) => e.name.trim().toLowerCase() === name.toLowerCase()))
      return void toast.error(`An event named "${name}" already exists.`);

    const { tbd, autoMarkAbsent, ...rest } = form;
    const payload = {
      ...rest,
      name,
      allocationAmount: Number(form.allocationAmount) || 0,
      date: form.isNonConducting ? "" : tbd ? "TBD" : form.date,
      assignedMembers,
    };
    setSaving(true);
    try {
      if (editing === "new") {
        const created = await eventsService.create({ ...payload, autoMarkAbsent });
        mutate("events", (prev) => [...prev, created]);
      } else if (editing.autoMarkAbsent !== autoMarkAbsent) {
        // The auto-absent switch must reach the server immediately, never the offline queue.
        replaceEvent(editing.id, await eventsService.updateOnlineOnly(editing.id, { ...payload, autoMarkAbsent }));
      } else {
        replaceEvent(editing.id, await eventsService.update(editing.id, payload));
      }
      toast.success(`Event ${editing === "new" ? "created" : "updated"} successfully`);
      setEditing(null);
    } catch (error) {
      console.error("Error saving event:", error);
      toast.error(errorMessage(error, `Failed to ${editing === "new" ? "create" : "update"} event`));
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await eventsService.delete(toDelete.id);
      mutate("events", (prev) => prev.filter((e) => e.id !== toDelete.id));
      setToDelete(null);
      toast.success("Event deleted successfully");
    } catch (error) {
      console.error("Error deleting event:", error);
      toast.error("Failed to delete event");
    } finally {
      setSaving(false);
    }
  };

  const rollOutEvaluation = async () => {
    if (!evaluating) return;
    const url = formUrl.trim();
    if (!url) return void toast.error("Paste this event's evaluation Form URL first.");
    setSaving(true);
    try {
      await eventsService.update(evaluating.id, { evaluationActive: true, evaluationFormUrl: url });
      await notificationsService.sendAnnouncement({
        recipientKind: "all_students",
        title: `Evaluation open: ${evaluating.name}`,
        body: "Please complete the evaluation for this event — it's required before you can access your record again.",
      });
      replaceEvent(evaluating.id, { evaluationActive: true, evaluationFormUrl: url });
      setEvaluating(null);
      toast.success("Evaluation rolled out and students notified");
    } catch (error) {
      console.error("Error rolling out evaluation:", error);
      toast.error("Failed to roll out evaluation");
    } finally {
      setSaving(false);
    }
  };

  const stopEvaluation = async (event: Event) => {
    try {
      await eventsService.update(event.id, { evaluationActive: false });
      replaceEvent(event.id, { evaluationActive: false });
      toast.success("Evaluation requirement turned off");
    } catch (error) {
      console.error("Error stopping evaluation rollout:", error);
      toast.error("Failed to update event");
    }
  };

  const todayISO = today();
  const upcoming = events.filter((e) => !e.isNonConducting && !isTbd(e) && e.date! >= todayISO).length;
  const contributionEvents = events.filter((e) => !e.isNoContribution);
  const totalExpected = contributionEvents.reduce((sum, e) => sum + (expected[e.id] ?? 0), 0);
  const totalCollected = contributionEvents.reduce((sum, e) => sum + (collected[e.id] ?? 0), 0);

  const createButton = canManage && (
    <button onClick={() => openForm()} className="btn btn-primary">
      <Plus className="h-4 w-4" /> Create event
    </button>
  );

  return (
    <Page
      eyebrow="Events"
      title="Event Management"
      subtitle="Plan events, attendance sessions and per-student allocations."
      onBack={onBack}
      actions={createButton}
      hero={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard featured label="Total events" value={events.length} icon={Calendar} />
          <StatCard label="Upcoming" value={upcoming} icon={CalendarClock} tone="warning" />
          <StatCard label="Expected" value={formatPeso(totalExpected)} icon={Target} hint="Excludes LSC officers" />
          <StatCard label="Collected" value={formatPeso(totalCollected)} icon={Wallet} tone="success" />
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-3xl" />
          ))}
        </div>
      ) : sortedEvents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Calendar}
            title="No events yet"
            description="Create an event to start tracking attendance and contributions."
            action={createButton}
          />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sortedEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              expected={expected[event.id] ?? 0}
              collected={collected[event.id] ?? 0}
              actions={
                canManage && (
                  <Menu>
                    <RowActionsTrigger label={`Actions for ${event.name}`} />
                    <MenuContent>
                      <MenuItem onSelect={() => openForm(event)}><Pencil /> Edit</MenuItem>
                      {event.evaluationActive ? (
                        <MenuItem onSelect={() => stopEvaluation(event)}><ClipboardCheck /> Turn off evaluation</MenuItem>
                      ) : (
                        <MenuItem onSelect={() => { setEvaluating(event); setFormUrl(event.evaluationFormUrl ?? ""); }}>
                          <ClipboardCheck /> Roll out evaluation
                        </MenuItem>
                      )}
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setToDelete(event)}><Trash2 /> Delete</MenuItem>
                    </MenuContent>
                  </Menu>
                )
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        icon={<Calendar className="h-5 w-5 text-brand-500" />}
        title={editing === "new" ? "Create event" : "Edit event"}
        description="Sessions define which attendance scans this event expects."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={saveEvent}
              disabled={saving || !form.name.trim() || (!form.isNonConducting && !form.tbd && !form.date)}
            >
              {saving ? "Saving…" : editing === "new" ? "Create event" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Event name">
            <input className="input" value={form.name} onChange={(e) => patchForm({ name: e.target.value })} placeholder="e.g., General Assembly" />
          </Field>

          <div className="space-y-2">
            <Toggle
              label="Non-conducting event"
              hint="No date or attendance required."
              checked={form.isNonConducting}
              onChange={(on) => patchForm(on ? { isNonConducting: true, date: "", schedules: [] } : { isNonConducting: false })}
            />
            <Toggle
              label="No contribution required"
              hint="Excludes this event from collection tracking & performance."
              checked={form.isNoContribution}
              onChange={(on) => patchForm(on ? { isNoContribution: true, contributionDeadline: "", allocationAmount: 0 } : { isNoContribution: false })}
            />
            {canManage && (
              <Toggle
                label="Auto mark absent"
                hint="After the event day ends, students without attendance are marked absent automatically."
                checked={form.autoMarkAbsent}
                onChange={(on) => patchForm({ autoMarkAbsent: on })}
              />
            )}
          </div>

          {!(form.isNonConducting && form.isNoContribution) && (
            <div className={cn("grid gap-4", !form.isNonConducting && !form.isNoContribution && "sm:grid-cols-2")}>
              {!form.isNonConducting && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="label">Date</span>
                    <label className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
                      <input type="checkbox" className="accent-brand-500" checked={form.tbd} onChange={(e) => patchForm({ tbd: e.target.checked, date: "" })} />
                      To be determined
                    </label>
                  </div>
                  <input type="date" className="input" value={form.date} disabled={form.tbd} onChange={(e) => patchForm({ date: e.target.value })} />
                </div>
              )}
              {!form.isNoContribution && (
                <Field label="Contribution deadline" hint="Last on-time day. Blank = no deadline.">
                  <input type="date" className="input" value={form.contributionDeadline} onChange={(e) => patchForm({ contributionDeadline: e.target.value })} />
                </Field>
              )}
            </div>
          )}

          {!form.isNoContribution && (
            <Field label="Allocation per student (₱)">
              <input
                type="number"
                min={0}
                className="input"
                placeholder="0"
                value={form.allocationAmount || ""}
                onChange={(e) => patchForm({ allocationAmount: parseInt(e.target.value) || 0 })}
              />
            </Field>
          )}

          {!form.isNonConducting && (
            <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
              <div>
                <p className="text-sm font-semibold text-ink">Attendance schedule</p>
                <p className="text-xs text-muted">Add only the sessions required for this event.</p>
              </div>
              <div className="flex gap-2">
                <select className="input flex-1" value={sessionToAdd} onChange={(e) => setSessionToAdd(e.target.value as EventSession | "")}>
                  <option value="">Select time of day</option>
                  {Object.entries(SESSIONS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary h-11" onClick={addSession} disabled={!sessionToAdd}>
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {form.schedules.map((s) => {
                const { label, icon: Icon } = SESSIONS[s.period];
                return (
                  <div key={s.period} className="space-y-3 rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon className="h-4 w-4 text-brand-500" /> {label}</p>
                      <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => patchForm({ schedules: form.schedules.filter((x) => x.period !== s.period) })}>
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["In", "Out"] as const).map((dir) => {
                        const enabledKey = `time${dir}Enabled` as const;
                        const timeKey = `time${dir}` as const;
                        return (
                          <div key={dir}>
                            <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                              <input
                                type="checkbox"
                                className="accent-brand-500"
                                checked={s[enabledKey]}
                                onChange={(e) => updateSchedule(s.period, { [enabledKey]: e.target.checked, [timeKey]: e.target.checked ? s[timeKey] : "" })}
                              />
                              Time {dir.toLowerCase()}
                            </label>
                            {s[enabledKey] && (
                              <TimeInput12 value={s[timeKey] ?? ""} onChange={(v) => updateSchedule(s.period, { [timeKey]: v })} ariaLabel={`${s.period} time ${dir.toLowerCase()}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {form.schedules.length === 0 && (
                <p className="py-2 text-center text-xs text-muted">No sessions added — this event won't require scheduled attendance.</p>
              )}
            </div>
          )}

          {canManage && assignedMembers.length > 0 && (
            <div>
              <p className="label flex items-center gap-1.5"><UserCheck className="h-4 w-4 text-muted" /> Assigned board members</p>
              <div data-lenis-prevent className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {assignedMembers.map((m) => (
                  <span key={m.memberId} className="chip chip-neutral">{m.memberName}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!evaluating}
        onClose={() => setEvaluating(null)}
        icon={<ClipboardCheck className="h-5 w-5 text-brand-500" />}
        title="Roll out evaluation"
        description={
          <>
            Paste the Google Form URL for <b className="text-ink">{evaluating?.name}</b>. Every student not yet in this event's response Sheet must
            fill it out before viewing their record, and all students will be notified.
          </>
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEvaluating(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={rollOutEvaluation} disabled={saving}>{saving ? "Rolling out…" : "Roll out & notify"}</button>
          </>
        }
      >
        <Field label="Evaluation form URL">
          <input type="url" className="input" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://docs.google.com/forms/d/e/.../viewform" />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={deleteEvent}
        loading={saving}
        title="Delete event"
        confirmLabel="Delete event"
        description={
          <>
            Delete <b className="text-ink">{toDelete?.name}</b>? This also removes related payments, contributions, attendance records and
            transactions, and cannot be undone.
          </>
        }
      />
    </Page>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-brand-500" : "bg-line")}>
        <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-1")} />
      </span>
    </button>
  );
}

function EventCard({ event, expected, collected, actions }: { event: Event; expected: number; collected: number; actions: ReactNode }) {
  const date = event.isNonConducting || isTbd(event) ? null : parseCalendarDate(event.date!);
  const status = eventStatus(event);
  const deadline = event.contributionDeadline ? deadlineChip(event.contributionDeadline) : null;
  const pct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;

  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-center leading-none text-brand-600">
          {date ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider">{date.toLocaleDateString("en-US", { month: "short" })}</p>
              <p className="mt-0.5 text-xl font-extrabold">{date.getDate()}</p>
            </div>
          ) : (
            <p className="text-xs font-bold">{event.isNonConducting ? "N/A" : "TBD"}</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-ink" title={event.name}>{event.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={cn("chip", status.tone)}>{status.label}</span>
            {event.isNoContribution && <span className="chip chip-neutral">No contribution</span>}
            {event.evaluationActive && <span className="chip chip-brand"><ClipboardCheck className="h-3 w-3" /> Evaluation open</span>}
          </div>
        </div>
        {actions}
      </div>

      <dl className="mt-5 space-y-2.5 text-sm">
        {!event.isNoContribution && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Contribution deadline</dt>
            <dd className="flex items-center gap-1.5 text-right text-ink">
              {deadline ? (
                <>
                  {formatDate(event.contributionDeadline!)} <span className={cn("chip", deadline.tone)}>{deadline.label}</span>
                </>
              ) : (
                <span className="text-muted">Not set</span>
              )}
            </dd>
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted">Sessions</dt>
          <dd className="space-y-1 text-right">
            {event.isNonConducting ? (
              <span className="text-muted">No attendance required</span>
            ) : event.schedules?.length ? (
              event.schedules.map((s) => {
                const { label, icon: Icon } = SESSIONS[s.period];
                return (
                  <p key={s.period} className="flex items-center justify-end gap-1.5 whitespace-nowrap text-ink">
                    <Icon className="h-3.5 w-3.5 text-brand-500" aria-label={label} />
                    {s.timeIn || s.timeOut ? formatTimeRange(s.timeIn, s.timeOut) : <span className="text-muted">{label} · time not set</span>}
                  </p>
                );
              })
            ) : (
              <span className="flex items-center gap-1.5 text-muted"><Clock className="h-3.5 w-3.5" /> No sessions</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-5">
        <div className="rounded-2xl bg-surface-2 p-4">
          {event.isNoContribution ? (
            <p className="text-center text-xs text-muted">No contribution required — excluded from collection tracking.</p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">Collected</p>
                  <p className="text-lg font-extrabold text-ink">{formatPeso(collected)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">{formatPeso(event.allocationAmount)} / student</p>
                  <p className="text-xs font-semibold text-muted">of {formatPeso(expected)} expected</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-500" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
