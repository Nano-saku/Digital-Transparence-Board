import { offlineSyncService } from "../../lib/offlineSync";
import { escapeLikePattern } from "../../lib/utils";
import type { BoardMember, EventVolunteer, LscOfficer, Student } from "../../types";
import {
  buildAudit,
  defineTable,
  field,
  newId,
  nowIso,
  nullable,
  opt,
  pgCode,
  required,
  sb,
  unwrap,
  DESC,
  type Row,
} from "./core";
import { studentsService } from "./students";

/** Officer positions for display, e.g. "Creative Director / Board Member". */
export function formatLscPositions(positions: string[] | undefined | null): string {
  return positions?.length ? positions.join(" / ") : "No role assigned";
}

/** positions may be a text[] column, a JSON string, or legacy "A / B" text. */
function parsePositions(value: unknown): string[] {
  const nonEmpty = (list: unknown[]) =>
    list.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  if (Array.isArray(value)) return nonEmpty(value);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? nonEmpty(parsed) : [];
  } catch {
    return value.split("/").map((s) => s.trim()).filter(Boolean);
  }
}

const text = (column: string, fallback = "") => field(column, (value) => value || fallback);
const timestamp = (column: string) => field(column, (value) => value || nowIso());

/** getAll() for tables that may be missing on older deployments: cache, else empty. */
const orEmpty =
  (table: string) =>
  (error: unknown): [] => {
    console.warn(`${table} query error, returning cached/empty:`, (error as { message?: unknown })?.message);
    return [];
  };

// ============================================
// LSC OFFICERS
// ============================================
const officers = defineTable<LscOfficer>({
  name: "lsc_officers",
  entity: "lsc_officer",
  columns: {
    studentId: text("student_id"),
    studentDbId: opt("student_db_id"),
    name: text("name"),
    program: text("program"),
    yearLevel: field("year_level", (value) => Number(value) || 1),
    section: text("section"),
    positions: field("positions", parsePositions),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  order: [["name"]],
});

export type StudentAppointmentVerification = {
  status: "verified" | "not-appointed" | "error";
  appointments: LscOfficer[];
  error?: unknown;
};

type OfficerInput = {
  studentId: string;
  studentDbId?: string;
  name: string;
  program?: string;
  yearLevel?: number;
  section?: string;
  positions: string[];
};

const withPositions = (officer: LscOfficer, positions: string[]): Promise<LscOfficer> =>
  lscOfficersService.assign({ ...officer, positions });

export const lscOfficersService = {
  /**
   * The current appointments of one already-verified student. Bypasses the
   * officer-list cache and never turns a query failure into "not an officer".
   * Matches by student DB id and, for legacy rows without that foreign key,
   * by student number; every matching row is returned.
   */
  async verifyForStudent(student: Student): Promise<StudentAppointmentVerification> {
    try {
      const [byDbId, byNumber] = await Promise.all([
        unwrap<Row[] | null>(sb().from("lsc_officers").select("*").eq("student_db_id", student.id)),
        unwrap<Row[] | null>(
          sb().from("lsc_officers").select("*").ilike("student_id", escapeLikePattern(student.studentId.trim())),
        ),
      ]);
      const rowsById = new Map<string, Row>();
      for (const row of [...(byDbId ?? []), ...(byNumber ?? [])]) {
        const id = String(row.id ?? "");
        if (id) rowsById.set(id, row);
      }
      const appointments = [...rowsById.values()].map(officers.fromRow);
      return { status: appointments.length > 0 ? "verified" : "not-appointed", appointments };
    } catch (error) {
      console.error("Could not verify LSC appointment:", error);
      return { status: "error", appointments: [], error };
    }
  },

  getAll: (): Promise<LscOfficer[]> => officers.getAll().catch(orEmpty("lsc_officers")),

  async getByStudentId(studentId: string): Promise<LscOfficer | null> {
    const cleanId = studentId.trim().toLowerCase();
    return (await lscOfficersService.getAll()).find((o) => o.studentId.trim().toLowerCase() === cleanId) ?? null;
  },

  /** Admin-assigned (never inferred) officer record: creates it or replaces its positions. */
  async assign(input: OfficerInput): Promise<LscOfficer> {
    const existing = await lscOfficersService.getByStudentId(input.studentId);
    const id = existing?.id ?? newId();
    const now = nowIso();
    const positions = [...new Set(input.positions.map((p) => p.trim()).filter(Boolean))];
    const payload = {
      id,
      student_id: input.studentId,
      student_db_id: input.studentDbId || null,
      name: input.name,
      program: input.program ?? "",
      year_level: input.yearLevel ?? 1,
      section: input.section ?? "",
      positions,
      updated_at: now,
      ...(existing ? {} : { created_at: now }),
    };
    const description = `${existing ? "Updated roles for" : "Assigned"} LSC Officer ${input.name}: ${formatLscPositions(positions)}`;

    const result = await offlineSyncService.mutation<LscOfficer>({
      table: "lsc_officers",
      kind: existing ? "update" : "create",
      recordId: id,
      payload,
      audit: await buildAudit(
        existing ? "LSC_OFFICER_ROLES_UPDATED" : "LSC_OFFICER_ASSIGNED",
        "lsc_officer",
        description,
        id,
        { studentId: input.studentId, name: input.name, positions },
      ),
      makeLocal: () => ({ ...officers.fromRow(payload), createdAt: existing?.createdAt ?? now }),
      executeOnline: async () =>
        officers.fromRow(await unwrap<Row>(sb().from("lsc_officers").upsert(payload).select().single())),
    });
    return required(result, "Failed to assign LSC officer");
  },

  /** Adds a role, keeping the existing ones. */
  async addRole(studentId: string, roleToAdd: string): Promise<LscOfficer> {
    const officer = await lscOfficersService.getByStudentId(studentId);
    if (!officer) throw new Error(`Officer with student ID ${studentId} not found`);
    const positions: string[] = officer.positions;
    return positions.includes(roleToAdd) ? officer : withPositions(officer, [...positions, roleToAdd]);
  },

  /** Removes one role; removing the last one deletes the officer record. */
  async removeRole(studentId: string, roleToRemove: string): Promise<LscOfficer | null> {
    const officer = await lscOfficersService.getByStudentId(studentId);
    if (!officer) return null;
    const positions = (officer.positions as string[]).filter((role) => role !== roleToRemove);
    if (positions.length > 0) return withPositions(officer, positions);
    await lscOfficersService.remove(officer.id);
    return null;
  },

  async remove(id: string): Promise<void> {
    const officer = (await lscOfficersService.getAll()).find((o) => o.id === id);
    await offlineSyncService.mutation<void>({
      table: "lsc_officers",
      kind: "delete",
      recordId: id,
      payload: {},
      audit: await buildAudit(
        "LSC_OFFICER_REMOVED",
        "lsc_officer",
        `Removed LSC Officer status from ${officer?.name || id}.`,
        id,
      ),
      executeOnline: async () => {
        await unwrap(sb().from("lsc_officers").delete().eq("id", id));
      },
    });
  },
};

// ============================================
// EVENT VOLUNTEERS
// ============================================
const volunteers = defineTable<EventVolunteer>({
  name: "event_volunteers",
  entity: "event_volunteer",
  columns: {
    eventId: "event_id",
    eventName: text("event_name"),
    studentId: "student_id",
    studentName: text("student_name"),
    program: opt("program"),
    yearLevel: field("year_level", (value) => (value ? Number(value) : undefined)),
    section: opt("section"),
    roleOrTask: text("role_or_task", "Volunteer"),
    status: text("status", "assigned"),
    expiresAt: opt("expires_at"),
    createdAt: timestamp("created_at"),
  },
  order: [["created_at", DESC]],
});

const VOLUNTEER_ERRORS: Record<string, (studentName: string) => string> = {
  "23505": (studentName) => `${studentName} is already assigned as a volunteer for this event.`,
  "23503": () => "Invalid event or student selected. The record does not exist in the database.",
  "42501": () => "You do not have permission to assign volunteers. Officer admin access required.",
};

/** Default expiry: a week after the event day ends, else 90 days from now. */
function volunteerExpiry(eventDate?: string): string {
  const date = new Date();
  if (eventDate && eventDate !== "TBD" && !isNaN(Date.parse(eventDate))) {
    date.setTime(Date.parse(eventDate));
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() + 7);
  } else {
    date.setDate(date.getDate() + 90);
  }
  return date.toISOString();
}

export const eventVolunteersService = {
  getAll: (): Promise<EventVolunteer[]> => volunteers.getAll().catch(orEmpty("event_volunteers")),

  async getByEventId(eventId: string): Promise<EventVolunteer[]> {
    return (await eventVolunteersService.getAll()).filter((v) => v.eventId === eventId);
  },

  /** Matches the stored student id, falling back to the student's other identifier (DB id vs student number). */
  async getByStudentId(studentIdentifier: string): Promise<EventVolunteer[]> {
    const all = await eventVolunteersService.getAll();
    const cleanId = studentIdentifier.trim().toLowerCase();
    const matchesAny = (ids: Set<string>) => all.filter((v) => ids.has(v.studentId.trim().toLowerCase()));
    const direct = matchesAny(new Set([cleanId]));
    if (direct.length > 0) return direct;

    try {
      const student = (await studentsService.getAll()).find(
        (s) => s.id.toLowerCase() === cleanId || s.studentId.trim().toLowerCase() === cleanId,
      );
      if (student) return matchesAny(new Set([student.id.toLowerCase(), student.studentId.trim().toLowerCase()]));
    } catch {
      // A failed student lookup just means no fallback match.
    }
    return direct;
  },

  async assign(input: {
    eventId: string;
    eventName: string;
    studentId: string;
    studentName: string;
    program?: string;
    yearLevel?: number;
    section?: string;
    roleOrTask: string;
    eventDate?: string;
    expiresAt?: string;
  }): Promise<EventVolunteer> {
    const id = newId();
    const payload = {
      id,
      event_id: input.eventId,
      event_name: input.eventName,
      student_id: input.studentId,
      student_name: input.studentName,
      program: input.program || "",
      year_level: input.yearLevel || 0,
      section: input.section || "",
      role_or_task: input.roleOrTask,
      status: "assigned",
      expires_at: input.expiresAt || volunteerExpiry(input.eventDate),
      created_at: nowIso(),
    };

    const result = await offlineSyncService.mutation<EventVolunteer>({
      table: "event_volunteers",
      kind: "create",
      recordId: id,
      payload,
      audit: await buildAudit(
        "EVENT_VOLUNTEER_ASSIGNED",
        "event_volunteer",
        `Assigned volunteer ${input.studentName} to event ${input.eventName} (${input.roleOrTask}).`,
        id,
        { eventId: input.eventId, studentId: input.studentId, roleOrTask: input.roleOrTask },
      ),
      makeLocal: () => volunteers.fromRow(payload),
      executeOnline: async () => {
        const { data, error } = await sb().from("event_volunteers").insert(payload).select().single();
        if (error) {
          const friendly = VOLUNTEER_ERRORS[String(pgCode(error))];
          throw friendly ? new Error(friendly(input.studentName)) : error;
        }
        return volunteers.fromRow(data);
      },
    });
    return required(result, "Failed to assign event volunteer");
  },

  async remove(id: string): Promise<void> {
    const volunteer = (await eventVolunteersService.getAll()).find((item) => item.id === id);
    await offlineSyncService.mutation<void>({
      table: "event_volunteers",
      kind: "delete",
      recordId: id,
      payload: {},
      audit: await buildAudit(
        "EVENT_VOLUNTEER_REMOVED",
        "event_volunteer",
        `Removed volunteer ${volunteer?.studentName ?? id} from event ${volunteer?.eventName ?? ""}.`,
        id,
      ),
      executeOnline: async () => {
        await unwrap(sb().from("event_volunteers").delete().eq("id", id));
      },
    });
  },
};

// ============================================
// BOARD MEMBERS (read-only here; created by the invite-officer script)
// ============================================
const boardMembers = defineTable<BoardMember>({
  name: "board_members",
  entity: "board_member",
  columns: { name: "name", accountUserId: nullable("account_user_id") },
  order: [["name"]],
});

export const boardMembersService = {
  /** Catalog board members plus officers holding the "Board Member" position, deduped by name. */
  async listBoardMembers(): Promise<BoardMember[]> {
    const catalog = await boardMembers.getAll().catch((): BoardMember[] => []);
    try {
      const officerMembers = (await lscOfficersService.getAll())
        .filter((o) => (o.positions as string[]).includes("Board Member"))
        .map((o): BoardMember => ({ id: `officer-${o.id}`, name: o.name }));
      // A later catalog row replaces an earlier same-name one; officers only fill gaps.
      const byName = new Map<string, BoardMember>();
      for (const member of catalog) byName.set(member.name.toLowerCase().trim(), member);
      for (const member of officerMembers) {
        const key = member.name.toLowerCase().trim();
        if (!byName.has(key)) byName.set(key, member);
      }
      return [...byName.values()];
    } catch {
      return catalog;
    }
  },
};
