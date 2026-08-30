import { getSupabase } from "../lib/supabase";
import { offlineSyncService } from "../lib/offlineSync";
import type {
  Student,
  Event,
  EventSchedule,
  AttendanceRecord,
  ContributionRecord,
  PaymentRecord,
  Transaction,
  FeedbackItem,
  FinancialSummary,
  FinancialReport,
  EventAllocation,
  BoardMember,
} from "../types";

// Operational tables use TEXT primary keys so they remain compatible with the
// former Firestore document-id format. PostgreSQL does not generate a value for
// a TEXT primary key, therefore every client-created row must receive one.
const createRecordId = (): string => crypto.randomUUID();

// The set of tables offlineSyncService knows how to cache/queue, pulled from
// its own method signature so this file doesn't need a second copy of that
// union type to stay in sync with.
type OfflineTable = Parameters<typeof offlineSyncService.read>[0];

// Shared "online-first, cache-fallback" read pattern used by every getAll().
// - If we already know we're offline, skip the network round-trip and go
//   straight to the cache.
// - Otherwise try the network; on success, refresh the cache for next time.
// - On any failure (including a network error the sync service hasn't
//   noticed yet), fall back to whatever is cached before giving up.
async function cachedRead<T>(
  table: OfflineTable,
  fetcher: () => Promise<T[]>,
): Promise<T[]> {
  if (offlineSyncService.isOffline()) {
    const cached = await offlineSyncService.read<T>(table);
    if (cached) return cached;
  }
  try {
    const records = await fetcher();
    await offlineSyncService.cache(table, records);
    return records;
  } catch (error) {
    const cached = await offlineSyncService.read<T>(table);
    if (cached) return cached;
    throw error;
  }
}

const mapEvent = (item: Record<string, unknown>): Event => {
  const memberIds = Array.isArray(item.assigned_member_ids)
    ? (item.assigned_member_ids as string[])
    : [];

  const memberNames = Array.isArray(item.assigned_member_names)
    ? (item.assigned_member_names as string[])
    : [];

  const schedules = Array.isArray(item.schedules)
    ? (item.schedules as EventSchedule[])
    : [];

  return {
    id: item.id as string,
    name: item.name as string,
    allocationAmount: item.allocation_amount as number,
    date: (item.date as string | null) ?? undefined,

    schedules,

    timeIn: (item.time_in as string | null) || undefined,
    timeOut: (item.time_out as string | null) || undefined,

    morningTimeIn: (item.morning_time_in as string | null) || undefined,

    morningTimeOut: (item.morning_time_out as string | null) || undefined,

    afternoonTimeIn: (item.afternoon_time_in as string | null) || undefined,

    afternoonTimeOut: (item.afternoon_time_out as string | null) || undefined,

    assignedMembers: memberIds.map((memberId, index) => ({
      memberId,
      memberName: memberNames[index] ?? "Unknown member",
    })),
  };
};

// ============================================
// STUDENTS SERVICE
// ============================================
export const studentsService = {
  async getAll(): Promise<Student[]> {
    return cachedRead<Student>("students", async () => {
      const { data, error } = await getSupabase()
        .from("students")
        .select("*")
        .order("name");

      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          name: item.name,
          program: item.program,
          yearLevel: item.year_level,
          section: item.section,
        })) || []
      );
    });
  },

  async getById(id: string): Promise<Student | null> {
    const students = await cachedRead<Student>("students", async () => {
      const { data, error } = await getSupabase().from("students").select("*");

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          name: item.name,
          program: item.program,
          yearLevel: item.year_level,
          section: item.section,
        })) || []
      );
    });

    return students.find((student) => student.id === id) ?? null;
  },

  async getByStudentId(studentId: string): Promise<Student | null> {
    const students = await cachedRead<Student>("students", async () => {
      const { data, error } = await getSupabase().from("students").select("*");

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          name: item.name,
          program: item.program,
          yearLevel: item.year_level,
          section: item.section,
        })) || []
      );
    });

    return students.find((student) => student.studentId === studentId) ?? null;
  },

  async getByName(name: string): Promise<Student | null> {
    const students = await cachedRead<Student>("students", async () => {
      const { data, error } = await getSupabase().from("students").select("*");

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          name: item.name,
          program: item.program,
          yearLevel: item.year_level,
          section: item.section,
        })) || []
      );
    });

    const searchName = name.toLowerCase();

    return (
      students.find((student) =>
        student.name.toLowerCase().includes(searchName),
      ) ?? null
    );
  },

  async create(student: Omit<Student, "id">): Promise<Student> {
    const id = createRecordId();
    const payload = {
      student_id: student.studentId,
      name: student.name,
      program: student.program,
      year_level: student.yearLevel,
      section: student.section,
    };

    const result = await offlineSyncService.mutation<Student>({
      table: "students",
      kind: "create",
      recordId: id,
      payload,
      makeLocal: () => ({ id, ...student }) as Student,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("students")
          .insert({ id, ...payload })
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          name: data.name,
          program: data.program,
          yearLevel: data.year_level,
          section: data.section,
        };
      },
    });

    if (!result) throw new Error("Failed to create student");
    return result;
  },

  async update(id: string, record: Partial<Student>): Promise<Student> {
    const updateData: Record<string, unknown> = {};

    if (record.studentId !== undefined)
      updateData.student_id = record.studentId;
    if (record.name !== undefined) updateData.name = record.name;
    if (record.program !== undefined) updateData.program = record.program;
    if (record.yearLevel !== undefined)
      updateData.year_level = record.yearLevel;
    if (record.section !== undefined) updateData.section = record.section;

    const result = await offlineSyncService.mutation<Student>({
      table: "students",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({ ...(current as Student), ...record, id }) as Student,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("students")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          name: data.name,
          program: data.program,
          yearLevel: data.year_level,
          section: data.section,
        };
      },
    });

    if (!result) throw new Error("Failed to update student");
    return result;
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "students",
      kind: "delete",
      recordId: id,
      payload: {},
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("students")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
    });
  },

  async createMany(students: Omit<Student, "id">[]): Promise<{
    created: Student[];
    failed: { index: number; studentId: string; name: string; error: string }[];
  }> {
    const created: Student[] = [];
    const failed: {
      index: number;
      studentId: string;
      name: string;
      error: string;
    }[] = [];

    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      try {
        const result = await this.create(student);
        created.push(result);
      } catch (error) {
        failed.push({
          index: i,
          studentId: student.studentId,
          name: student.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { created, failed };
  },

  async search(query: string): Promise<Student[]> {
    const pattern = `%${query}%`;
    const [byName, byId] = await Promise.all([
      getSupabase()
        .from("students")
        .select("*")
        .ilike("name", pattern)
        .order("name"),
      getSupabase()
        .from("students")
        .select("*")
        .ilike("student_id", pattern)
        .order("name"),
    ]);
    if (byName.error) throw byName.error;
    if (byId.error) throw byId.error;
    const seen = new Map<string, Record<string, unknown>>();
    [...(byName.data ?? []), ...(byId.data ?? [])].forEach((item) =>
      seen.set(item.id, item),
    );
    return [...seen.values()].map((item) => ({
      id: item.id as string,
      studentId: item.student_id as string,
      name: item.name as string,
      program: item.program as string,
      yearLevel: item.year_level as number,
      section: item.section as string,
    }));
  },
};

// ============================================
// EVENTS SERVICE
// ============================================
export const eventsService = {
  async getAll(): Promise<Event[]> {
    return cachedRead<Event>("events", async () => {
      const { data, error } = await getSupabase()
        .from("events")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      return data?.map(mapEvent) || [];
    });
  },

  async getById(id: string): Promise<Event | null> {
    if (offlineSyncService.isOffline()) {
      const cached = await offlineSyncService.read<Event>("events");
      return cached?.find((event) => event.id === id) ?? null;
    }
    const { data, error } = await getSupabase()
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return mapEvent(data);
  },

  async create(event: Omit<Event, "id">): Promise<Event> {
    const id = createRecordId();
    const payload = {
      name: event.name,
      allocation_amount: event.allocationAmount,
      date: event.date,
      schedules: event.schedules ?? [],
      time_in: event.timeIn ?? "",
      time_out: event.timeOut ?? "",
      morning_time_in: event.morningTimeIn ?? "",
      morning_time_out: event.morningTimeOut ?? "",
      afternoon_time_in: event.afternoonTimeIn ?? "",
      afternoon_time_out: event.afternoonTimeOut ?? "",
      assigned_member_ids:
        event.assignedMembers?.map((member) => member.memberId) ?? [],
      assigned_member_names:
        event.assignedMembers?.map((member) => member.memberName) ?? [],
    };

    const result = await offlineSyncService.mutation<Event>({
      table: "events",
      kind: "create",
      recordId: id,
      payload,
      makeLocal: () => ({ id, ...event }) as Event,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("events")
          .insert({ id, ...payload })
          .select()
          .single();

        if (error) throw error;
        return mapEvent(data);
      },
    });

    if (!result) throw new Error("Failed to create event");
    return result;
  },

  async update(id: string, event: Partial<Event>): Promise<Event> {
    const updateData: Record<string, unknown> = {};
    if (event.name !== undefined) updateData.name = event.name;
    if (event.allocationAmount !== undefined)
      updateData.allocation_amount = event.allocationAmount;
    if (event.schedules !== undefined) {
      updateData.schedules = event.schedules;
    }
    if (event.date !== undefined) updateData.date = event.date;
    if (event.timeIn !== undefined) updateData.time_in = event.timeIn;
    if (event.timeOut !== undefined) updateData.time_out = event.timeOut;
    if (event.morningTimeIn !== undefined)
      updateData.morning_time_in = event.morningTimeIn;
    if (event.morningTimeOut !== undefined)
      updateData.morning_time_out = event.morningTimeOut;
    if (event.afternoonTimeIn !== undefined)
      updateData.afternoon_time_in = event.afternoonTimeIn;
    if (event.afternoonTimeOut !== undefined)
      updateData.afternoon_time_out = event.afternoonTimeOut;
    if (event.assignedMembers !== undefined) {
      updateData.assigned_member_ids = event.assignedMembers.map(
        (member) => member.memberId,
      );
      updateData.assigned_member_names = event.assignedMembers.map(
        (member) => member.memberName,
      );
    }

    const result = await offlineSyncService.mutation<Event>({
      table: "events",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({ ...(current as Event), ...event, id }) as Event,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("events")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return mapEvent(data);
      },
    });

    if (!result) throw new Error("Failed to update event");
    return result;
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "events",
      kind: "delete",
      recordId: id,
      payload: {},
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("events")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
    });
  },
};

// ============================================
// ATTENDANCE SERVICE
// ============================================
export const attendanceService = {
  async getAll(): Promise<AttendanceRecord[]> {
    return cachedRead<AttendanceRecord>("attendance", async () => {
      const { data, error } = await getSupabase()
        .from("attendance")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          eventId: item.event_id,
          eventName: item.event_name,
          date: item.date,
          status: item.status,
          session: (item.session ?? "morning") as
            | "morning"
            | "afternoon"
            | "evening",
          timeIn: item.time_in ?? undefined,
          timeOut: item.time_out ?? undefined,
        })) || []
      );
    });
  },

  async getByStudentId(studentId: string): Promise<AttendanceRecord[]> {
    return cachedRead<AttendanceRecord>("attendance", async () => {
      const { data, error } = await getSupabase()
        .from("attendance")
        .select("*")
        .eq("student_id", studentId)
        .order("date", { ascending: false });

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          eventId: item.event_id,
          eventName: item.event_name,
          date: item.date,
          status: item.status,
          session: (item.session ?? "morning") as
            | "morning"
            | "afternoon"
            | "evening",
          timeIn: item.time_in ?? undefined,
          timeOut: item.time_out ?? undefined,
        })) || []
      );
    }).then((records) =>
      records
        .filter((record) => record.studentId === studentId)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    );
  },

  async getByEventId(eventId: string): Promise<AttendanceRecord[]> {
    return cachedRead<AttendanceRecord>("attendance", async () => {
      const { data, error } = await getSupabase()
        .from("attendance")
        .select("*")
        .eq("event_id", eventId)
        .order("date", { ascending: false });

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          eventId: item.event_id,
          eventName: item.event_name,
          date: item.date,
          status: item.status,
          session: (item.session ?? "morning") as
            | "morning"
            | "afternoon"
            | "evening",
          timeIn: item.time_in ?? undefined,
          timeOut: item.time_out ?? undefined,
        })) || []
      );
    }).then((records) =>
      records
        .filter((record) => record.eventId === eventId)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    );
  },

  async getByEventIdAndSession(
    eventId: string,
    session: "morning" | "afternoon" | "evening",
  ): Promise<AttendanceRecord[]> {
    return cachedRead<AttendanceRecord>("attendance", async () => {
      const { data, error } = await getSupabase()
        .from("attendance")
        .select("*")
        .eq("event_id", eventId)
        .eq("session", session)
        .order("date", { ascending: false });

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          eventId: item.event_id,
          eventName: item.event_name,
          date: item.date,
          status: item.status,
          session: (item.session ?? session) as
            | "morning"
            | "afternoon"
            | "evening",
          timeIn: item.time_in ?? undefined,
          timeOut: item.time_out ?? undefined,
        })) || []
      );
    }).then((records) =>
      records
        .filter(
          (record) => record.eventId === eventId && record.session === session,
        )
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
    );
  },

  async create(
    record: Omit<AttendanceRecord, "id">,
  ): Promise<AttendanceRecord> {
    const id = createRecordId();
    const payload = {
      student_id: record.studentId,
      event_id: record.eventId,
      event_name: record.eventName,
      date: record.date,
      status: record.status,
      session: record.session ?? "morning",
      time_in: record.timeIn ?? "",
      time_out: record.timeOut ?? "",
    };

    const result = await offlineSyncService.mutation<AttendanceRecord>({
      table: "attendance",
      kind: "create",
      recordId: id,
      payload,
      makeLocal: () => ({ id, ...record }) as AttendanceRecord,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("attendance")
          .insert({ id, ...payload })
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          eventId: data.event_id,
          eventName: data.event_name,
          date: data.date,
          status: data.status,
          session: (data.session ?? "morning") as
            | "morning"
            | "afternoon"
            | "evening",
          timeIn: data.time_in ?? undefined,
          timeOut: data.time_out ?? undefined,
        };
      },
    });

    if (!result) throw new Error("Failed to create attendance record");
    return result;
  },

  async update(
    id: string,
    record: Partial<AttendanceRecord>,
  ): Promise<AttendanceRecord> {
    const updateData: Record<string, unknown> = {};
    if (record.studentId !== undefined)
      updateData.student_id = record.studentId;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined)
      updateData.event_name = record.eventName;
    if (record.date !== undefined) updateData.date = record.date;
    if (record.status !== undefined) updateData.status = record.status;
    if (record.session !== undefined) updateData.session = record.session;
    if (record.timeIn !== undefined) updateData.time_in = record.timeIn;
    if (record.timeOut !== undefined) updateData.time_out = record.timeOut;

    const result = await offlineSyncService.mutation<AttendanceRecord>({
      table: "attendance",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({
          ...(current as AttendanceRecord),
          ...record,
          id,
        }) as AttendanceRecord,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("attendance")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          eventId: data.event_id,
          eventName: data.event_name,
          date: data.date,
          status: data.status,
          session: (data.session ?? "morning") as
            | "morning"
            | "afternoon"
            | "evening",
          timeIn: data.time_in ?? undefined,
          timeOut: data.time_out ?? undefined,
        };
      },
    });

    if (!result) throw new Error("Failed to update attendance record");
    return result;
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "attendance",
      kind: "delete",
      recordId: id,
      payload: {},
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("attendance")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
    });
  },

  async getStatsByEventId(
    eventId: string,
  ): Promise<{ present: number; absent: number; total: number }> {
    const { data, error } = await getSupabase()
      .from("attendance")
      .select("status")
      .eq("event_id", eventId);

    if (error) throw error;

    const present = data?.filter((r) => r.status === "present").length || 0;
    const absent = data?.filter((r) => r.status === "absent").length || 0;

    return { present, absent, total: present + absent };
  },
};

// ============================================
// CONTRIBUTIONS SERVICE
// ============================================
export const contributionsService = {
  async getAll(): Promise<ContributionRecord[]> {
    return cachedRead<ContributionRecord>("contributions", async () => {
      const { data, error } = await getSupabase()
        .from("contributions")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          eventId: item.event_id,
          eventName: item.event_name,
          requiredAmount: item.required_amount,
          amountPaid: item.amount_paid,
          remainingBalance: item.remaining_balance,
        })) || []
      );
    });
  },

  async getByStudentId(studentId: string): Promise<ContributionRecord[]> {
    const contributions = await cachedRead<ContributionRecord>(
      "contributions",
      async () => {
        const { data, error } = await getSupabase()
          .from("contributions")
          .select("*")
          .order("id", { ascending: false });

        if (error) throw error;

        return (
          data?.map((item) => ({
            id: item.id,
            studentId: item.student_id,
            eventId: item.event_id,
            eventName: item.event_name,
            requiredAmount: item.required_amount,
            amountPaid: item.amount_paid,
            remainingBalance: item.remaining_balance,
          })) || []
        );
      },
    );

    return contributions
      .filter((record) => record.studentId === studentId)
      .sort((a, b) => b.id.localeCompare(a.id));
  },
  async getByStudentAndEvent(
    studentId: string,
    eventId: string,
  ): Promise<ContributionRecord | null> {
    const contributions = await cachedRead<ContributionRecord>(
      "contributions",
      async () => {
        const { data, error } = await getSupabase()
          .from("contributions")
          .select("*");

        if (error) throw error;

        return (
          data?.map((item) => ({
            id: item.id,
            studentId: item.student_id,
            eventId: item.event_id,
            eventName: item.event_name,
            requiredAmount: item.required_amount,
            amountPaid: item.amount_paid,
            remainingBalance: item.remaining_balance,
          })) || []
        );
      },
    );

    return (
      contributions.find(
        (record) =>
          record.studentId === studentId && record.eventId === eventId,
      ) ?? null
    );
  },
  async getByEventId(eventId: string): Promise<ContributionRecord[]> {
    const contributions = await cachedRead<ContributionRecord>(
      "contributions",
      async () => {
        const { data, error } = await getSupabase()
          .from("contributions")
          .select("*")
          .order("id", { ascending: false });

        if (error) throw error;

        return (
          data?.map((item) => ({
            id: item.id,
            studentId: item.student_id,
            eventId: item.event_id,
            eventName: item.event_name,
            requiredAmount: item.required_amount,
            amountPaid: item.amount_paid,
            remainingBalance: item.remaining_balance,
          })) || []
        );
      },
    );

    return contributions
      .filter((record) => record.eventId === eventId)
      .sort((a, b) => b.id.localeCompare(a.id));
  },

  async create(
    record: Omit<ContributionRecord, "id">,
  ): Promise<ContributionRecord> {
    const id = createRecordId();
    const payload = {
      student_id: record.studentId,
      event_id: record.eventId,
      event_name: record.eventName,
      required_amount: record.requiredAmount,
      amount_paid: record.amountPaid,
      remaining_balance: record.remainingBalance,
    };

    const result = await offlineSyncService.mutation<ContributionRecord>({
      table: "contributions",
      kind: "create",
      recordId: id,
      payload,
      makeLocal: () => ({ id, ...record }) as ContributionRecord,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("contributions")
          .insert({ id, ...payload })
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          eventId: data.event_id,
          eventName: data.event_name,
          requiredAmount: data.required_amount,
          amountPaid: data.amount_paid,
          remainingBalance: data.remaining_balance,
        };
      },
    });

    if (!result) throw new Error("Failed to create contribution");
    return result;
  },

  async update(
    id: string,
    record: Partial<ContributionRecord>,
  ): Promise<ContributionRecord> {
    const updateData: Record<string, unknown> = {};
    if (record.studentId !== undefined)
      updateData.student_id = record.studentId;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined)
      updateData.event_name = record.eventName;
    if (record.requiredAmount !== undefined)
      updateData.required_amount = record.requiredAmount;
    if (record.amountPaid !== undefined)
      updateData.amount_paid = record.amountPaid;
    if (record.remainingBalance !== undefined)
      updateData.remaining_balance = record.remainingBalance;

    const result = await offlineSyncService.mutation<ContributionRecord>({
      table: "contributions",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({
          ...(current as ContributionRecord),
          ...record,
          id,
        }) as ContributionRecord,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("contributions")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          eventId: data.event_id,
          eventName: data.event_name,
          requiredAmount: data.required_amount,
          amountPaid: data.amount_paid,
          remainingBalance: data.remaining_balance,
        };
      },
    });

    if (!result) throw new Error("Failed to update contribution");
    return result;
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "contributions",
      kind: "delete",
      recordId: id,
      payload: {},
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("contributions")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
    });
  },
};

// ============================================
// PAYMENTS SERVICE
// ============================================
export const paymentsService = {
  async getAll(): Promise<PaymentRecord[]> {
    return cachedRead<PaymentRecord>("payments", async () => {
      const { data, error } = await getSupabase()
        .from("payments")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          studentName: item.student_name,
          eventId: item.event_id,
          eventName: item.event_name,
          contributionId: item.contribution_id,
          amount: item.amount,
          date: item.date,
          receiptUrl: item.receipt_url || undefined,
          orNumber: item.or_number || undefined,
          recordedBy: item.recorded_by,
        })) || []
      );
    });
  },

  async getByStudentId(studentId: string): Promise<PaymentRecord[]> {
    const payments = await cachedRead<PaymentRecord>("payments", async () => {
      const { data, error } = await getSupabase()
        .from("payments")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          studentName: item.student_name,
          eventId: item.event_id || undefined,
          eventName: item.event_name || undefined,
          contributionId: item.contribution_id,
          amount: item.amount,
          date: item.date,
          receiptUrl: item.receipt_url || undefined,
          orNumber: item.or_number || undefined,
          recordedBy: item.recorded_by,
        })) || []
      );
    });

    return payments
      .filter((payment) => payment.studentId === studentId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  async getByEventId(eventId: string): Promise<PaymentRecord[]> {
    const payments = await cachedRead<PaymentRecord>("payments", async () => {
      const { data, error } = await getSupabase()
        .from("payments")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          studentId: item.student_id,
          studentName: item.student_name,
          eventId: item.event_id || undefined,
          eventName: item.event_name || undefined,
          contributionId: item.contribution_id,
          amount: item.amount,
          date: item.date,
          receiptUrl: item.receipt_url || undefined,
          orNumber: item.or_number || undefined,
          recordedBy: item.recorded_by,
        })) || []
      );
    });

    return payments
      .filter((payment) => payment.eventId === eventId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  async create(record: Omit<PaymentRecord, "id">): Promise<PaymentRecord> {
    const id = createRecordId();
    const payload = {
      student_id: record.studentId,
      student_name: record.studentName,
      event_id: record.eventId,
      event_name: record.eventName,
      contribution_id: record.contributionId,
      amount: record.amount,
      date: record.date,
      receipt_url: record.receiptUrl,
      or_number: record.orNumber,
      recorded_by: record.recordedBy,
    };

    const result = await offlineSyncService.mutation<PaymentRecord>({
      table: "payments",
      kind: "create",
      recordId: id,
      payload,
      makeLocal: () => ({ id, ...record }) as PaymentRecord,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("payments")
          .insert({ id, ...payload })
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          studentName: data.student_name,
          eventId: data.event_id || undefined,
          eventName: data.event_name || undefined,
          contributionId: data.contribution_id || undefined,
          amount: data.amount,
          date: data.date,
          receiptUrl: data.receipt_url || undefined,
          orNumber: data.or_number || undefined,
          recordedBy: data.recorded_by,
        };
      },
    });

    if (!result) throw new Error("Failed to create payment");
    return result;
  },

  async update(
    id: string,
    record: Partial<PaymentRecord>,
  ): Promise<PaymentRecord> {
    const updateData: Record<string, unknown> = {};
    if (record.studentId !== undefined)
      updateData.student_id = record.studentId;
    if (record.studentName !== undefined)
      updateData.student_name = record.studentName;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined)
      updateData.event_name = record.eventName;
    if (record.amount !== undefined) updateData.amount = record.amount;
    if (record.date !== undefined) updateData.date = record.date;
    if (record.receiptUrl !== undefined)
      updateData.receipt_url = record.receiptUrl;
    if (record.orNumber !== undefined) updateData.or_number = record.orNumber;
    if (record.recordedBy !== undefined)
      updateData.recorded_by = record.recordedBy;

    const result = await offlineSyncService.mutation<PaymentRecord>({
      table: "payments",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({ ...(current as PaymentRecord), ...record, id }) as PaymentRecord,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("payments")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          studentId: data.student_id,
          studentName: data.student_name,
          eventId: data.event_id || undefined,
          eventName: data.event_name || undefined,
          contributionId: data.contribution_id,
          amount: data.amount,
          date: data.date,
          receiptUrl: data.receipt_url || undefined,
          orNumber: data.or_number || undefined,
          recordedBy: data.recorded_by,
        };
      },
    });

    if (!result) throw new Error("Failed to update payment");
    return result;
  },

  // NOT wired to offlineSyncService: this reads a contribution first to find
  // which payments belong to it, then deletes across two tables. The
  // mutation() queue only knows how to replay a single { table, kind,
  // recordId, payload } operation, so a read-then-multi-delete like this
  // can't be represented as one queued item. It still works fully online;
  // offline, it will throw like it did before this change. If offline
  // deletion of contributions/payments turns out to matter, this needs its
  // own design (e.g. queuing two explicit mutations after reading the
  // contribution while still online).
  async delete(id: string): Promise<void> {
    const supabase = getSupabase();

    // Get the contribution first so we know which student/event it belongs to
    const { data: contribution, error: contributionError } = await supabase
      .from("contributions")
      .select("student_id, event_id")
      .eq("id", id)
      .single();

    if (contributionError) throw contributionError;

    // Delete related payments
    const { error: paymentError } = await supabase
      .from("payments")
      .delete()
      .eq("student_id", contribution.student_id)
      .eq("event_id", contribution.event_id);

    if (paymentError) throw paymentError;

    // Delete the contribution
    const { error: contributionDeleteError } = await supabase
      .from("contributions")
      .delete()
      .eq("id", id);

    if (contributionDeleteError) throw contributionDeleteError;
  },
};

// ============================================
// TRANSACTIONS SERVICE
// ============================================
export const transactionsService = {
  async getAll(): Promise<Transaction[]> {
    return cachedRead<Transaction>("transactions", async () => {
      const { data, error } = await getSupabase()
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          date: item.date,
          description: item.description,
          eventId: item.event_id || undefined,
          eventName: item.event_name || undefined,
          amount: item.amount,
          type: item.type,
          responsibleOfficer: item.responsible_officer,
          receiptUrl: item.receipt_url || undefined,
        })) || []
      );
    });
  },

  async getByEventId(eventId: string): Promise<Transaction[]> {
    const { data, error } = await getSupabase()
      .from("transactions")
      .select("*")
      .eq("event_id", eventId)
      .order("date", { ascending: false });

    if (error) throw error;
    return (
      data?.map((item) => ({
        id: item.id,
        date: item.date,
        description: item.description,
        eventId: item.event_id || undefined,
        eventName: item.event_name || undefined,
        amount: item.amount,
        type: item.type,
        responsibleOfficer: item.responsible_officer,
        receiptUrl: item.receipt_url || undefined,
      })) || []
    );
  },

  async create(record: Omit<Transaction, "id">): Promise<Transaction> {
    const id = createRecordId();
    const payload = {
      date: record.date,
      description: record.description,
      event_id: record.eventId,
      event_name: record.eventName,
      amount: record.amount,
      type: record.type,
      responsible_officer: record.responsibleOfficer,
      receipt_url: record.receiptUrl,
    };

    const result = await offlineSyncService.mutation<Transaction>({
      table: "transactions",
      kind: "create",
      recordId: id,
      payload,
      makeLocal: () => ({ id, ...record }) as Transaction,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("transactions")
          .insert({ id, ...payload })
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          date: data.date,
          description: data.description,
          eventId: data.event_id || undefined,
          eventName: data.event_name || undefined,
          amount: data.amount,
          type: data.type,
          responsibleOfficer: data.responsible_officer,
          receiptUrl: data.receipt_url || undefined,
        };
      },
    });

    if (!result) throw new Error("Failed to create transaction");
    return result;
  },

  async update(id: string, record: Partial<Transaction>): Promise<Transaction> {
    const updateData: Record<string, unknown> = {};
    if (record.date !== undefined) updateData.date = record.date;
    if (record.description !== undefined)
      updateData.description = record.description;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined)
      updateData.event_name = record.eventName;
    if (record.amount !== undefined) updateData.amount = record.amount;
    if (record.type !== undefined) updateData.type = record.type;
    if (record.responsibleOfficer !== undefined)
      updateData.responsible_officer = record.responsibleOfficer;
    if (record.receiptUrl !== undefined)
      updateData.receipt_url = record.receiptUrl;

    const result = await offlineSyncService.mutation<Transaction>({
      table: "transactions",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({ ...(current as Transaction), ...record, id }) as Transaction,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("transactions")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          date: data.date,
          description: data.description,
          eventId: data.event_id || undefined,
          eventName: data.event_name || undefined,
          amount: data.amount,
          type: data.type,
          responsibleOfficer: data.responsible_officer,
          receiptUrl: data.receipt_url || undefined,
        };
      },
    });

    if (!result) throw new Error("Failed to update transaction");
    return result;
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "transactions",
      kind: "delete",
      recordId: id,
      payload: {},
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("transactions")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
    });
  },

  async getFinancialSummary(): Promise<{
    income: number;
    expense: number;
    balance: number;
  }> {
    const { data, error } = await getSupabase()
      .from("transactions")
      .select("type, amount");

    if (error) throw error;

    const income =
      data
        ?.filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0) || 0;
    const expense =
      data
        ?.filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0) || 0;

    return { income, expense, balance: income - expense };
  },
};

// ============================================
// FEEDBACK SERVICE
// ============================================
export const feedbackService = {
  async getAll(): Promise<FeedbackItem[]> {
    return cachedRead<FeedbackItem>("feedback", async () => {
      const { data, error } = await getSupabase()
        .from("feedback")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title || undefined,
          message: item.message,
          studentName: item.student_name || undefined,
          studentId: item.student_id || undefined,
          isAnonymous: item.is_anonymous,
          submittedAt: item.submitted_at,
          status: item.status,
        })) || []
      );
    });
  },

  async getByType(type: FeedbackItem["type"]): Promise<FeedbackItem[]> {
    const { data, error } = await getSupabase()
      .from("feedback")
      .select("*")
      .eq("type", type)
      .order("submitted_at", { ascending: false });

    if (error) throw error;
    return (
      data?.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title || undefined,
        message: item.message,
        studentName: item.student_name || undefined,
        studentId: item.student_id || undefined,
        isAnonymous: item.is_anonymous,
        submittedAt: item.submitted_at,
        status: item.status,
      })) || []
    );
  },

  async getByStatus(status: FeedbackItem["status"]): Promise<FeedbackItem[]> {
    const { data, error } = await getSupabase()
      .from("feedback")
      .select("*")
      .eq("status", status)
      .order("submitted_at", { ascending: false });

    if (error) throw error;
    return (
      data?.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title || undefined,
        message: item.message,
        studentName: item.student_name || undefined,
        studentId: item.student_id || undefined,
        isAnonymous: item.is_anonymous,
        submittedAt: item.submitted_at,
        status: item.status,
      })) || []
    );
  },

  // Returns void to match the original signature. Because there's no
  // makeLocal here, an offline-queued feedback submission won't appear in
  // getAll()'s cache until it replays on reconnect (the item is still
  // queued and will sync - it just isn't reflected locally in the
  // meantime). Fine for the common case (students submitting feedback
  // aren't officers, so isEnabled() is false for them and this always goes
  // straight to executeOnline anyway); revisit if officers need to see
  // their own offline feedback submissions immediately.
  async create(item: Omit<FeedbackItem, "id" | "submittedAt">): Promise<void> {
    const id = createRecordId();
    const payload = {
      type: item.type,
      title: item.title || null,
      message: item.message,
      student_name: item.studentName || null,
      student_id: item.studentId || null,
      is_anonymous: item.isAnonymous,
      submitted_at: new Date().toISOString(),
      status: item.status ?? "pending",
    };

    await offlineSyncService.mutation<void>({
      table: "feedback",
      kind: "create",
      recordId: id,
      payload,
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("feedback")
          .insert({ id, ...payload });

        if (error) {
          console.error("Feedback insert error:", error);
          throw error;
        }
      },
    });
  },

  async update(id: string, item: Partial<FeedbackItem>): Promise<FeedbackItem> {
    const updateData: Record<string, unknown> = {};
    if (item.type !== undefined) updateData.type = item.type;
    if (item.title !== undefined) updateData.title = item.title;
    if (item.message !== undefined) updateData.message = item.message;
    if (item.studentName !== undefined)
      updateData.student_name = item.studentName;
    if (item.studentId !== undefined) updateData.student_id = item.studentId;
    if (item.isAnonymous !== undefined)
      updateData.is_anonymous = item.isAnonymous;
    if (item.status !== undefined) updateData.status = item.status;

    const result = await offlineSyncService.mutation<FeedbackItem>({
      table: "feedback",
      kind: "update",
      recordId: id,
      payload: updateData,
      makeLocal: (current) =>
        ({ ...(current as FeedbackItem), ...item, id }) as FeedbackItem,
      executeOnline: async () => {
        const { data, error } = await getSupabase()
          .from("feedback")
          .update(updateData)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return {
          id: data.id,
          type: data.type,
          title: data.title || undefined,
          message: data.message,
          studentName: data.student_name || undefined,
          studentId: data.student_id || undefined,
          isAnonymous: data.is_anonymous,
          submittedAt: data.submitted_at,
          status: data.status,
        };
      },
    });

    if (!result) throw new Error("Failed to update feedback");
    return result;
  },

  async delete(id: string): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "feedback",
      kind: "delete",
      recordId: id,
      payload: {},
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("feedback")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
    });
  },

  async updateStatus(
    id: string,
    status: FeedbackItem["status"],
  ): Promise<void> {
    await offlineSyncService.mutation<void>({
      table: "feedback",
      kind: "update",
      recordId: id,
      payload: { status },
      executeOnline: async () => {
        const { error } = await getSupabase()
          .from("feedback")
          .update({ status })
          .eq("id", id);

        if (error) throw error;
      },
    });
  },
};

// ============================================
// FINANCIAL SUMMARY SERVICE
// ============================================
export const financialSummaryService = {
  async get(): Promise<FinancialSummary | null> {
    const { data, error } = await getSupabase()
      .from("financial_summaries")
      .select("*")
      .single();

    if (error) return null;
    return {
      totalBudget: data.total_budget,
      totalFundsCollected: data.total_funds_collected,
      totalFundsSpent: data.total_funds_spent,
      remainingBudget: data.remaining_budget,
      totalExpectedContributions: data.total_expected_contributions,
    };
  },

  async update(summary: Partial<FinancialSummary>): Promise<FinancialSummary> {
    const updateData: Record<string, unknown> = {};
    if (summary.totalBudget !== undefined)
      updateData.total_budget = summary.totalBudget;
    if (summary.totalFundsCollected !== undefined)
      updateData.total_funds_collected = summary.totalFundsCollected;
    if (summary.totalFundsSpent !== undefined)
      updateData.total_funds_spent = summary.totalFundsSpent;
    if (summary.remainingBudget !== undefined)
      updateData.remaining_budget = summary.remainingBudget;
    if (summary.totalExpectedContributions !== undefined)
      updateData.total_expected_contributions =
        summary.totalExpectedContributions;

    const { data, error } = await getSupabase()
      .from("financial_summaries")
      .update(updateData)
      .eq("id", "main")
      .select()
      .single();

    if (error) throw error;
    return {
      totalBudget: data.total_budget,
      totalFundsCollected: data.total_funds_collected,
      totalFundsSpent: data.total_funds_spent,
      remainingBudget: data.remaining_budget,
      totalExpectedContributions: data.total_expected_contributions,
    };
  },
};

// ============================================
// EVENT ALLOCATIONS SERVICE
// ============================================
export const eventAllocationsService = {
  async getAll(): Promise<EventAllocation[]> {
    const { data, error } = await getSupabase()
      .from("event_allocations")
      .select("*")
      .order("event_name", { ascending: true });

    if (error) throw error;
    return (
      data?.map((item) => ({
        eventId: item.event_id,
        eventName: item.event_name,
        allocationAmount: item.allocation_amount,
        totalCollected: item.total_collected,
        totalSpent: item.total_spent,
        remainingBalance: item.remaining_balance,
      })) || []
    );
  },

  async getByEventId(eventId: string): Promise<EventAllocation | null> {
    const { data, error } = await getSupabase()
      .from("event_allocations")
      .select("*")
      .eq("event_id", eventId)
      .single();

    if (error) return null;
    return {
      eventId: data.event_id,
      eventName: data.event_name,
      allocationAmount: data.allocation_amount,
      totalCollected: data.total_collected,
      totalSpent: data.total_spent,
      remainingBalance: data.remaining_balance,
    };
  },

  async create(
    allocation: Omit<EventAllocation, "id">,
  ): Promise<EventAllocation> {
    const { data, error } = await getSupabase()
      .from("event_allocations")
      .insert({
        id: allocation.eventId,
        event_id: allocation.eventId,
        event_name: allocation.eventName,
        allocation_amount: allocation.allocationAmount,
        total_collected: allocation.totalCollected,
        total_spent: allocation.totalSpent,
        remaining_balance: allocation.remainingBalance,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      eventId: data.event_id,
      eventName: data.event_name,
      allocationAmount: data.allocation_amount,
      totalCollected: data.total_collected,
      totalSpent: data.total_spent,
      remainingBalance: data.remaining_balance,
    };
  },

  async update(
    eventId: string,
    allocation: Partial<EventAllocation>,
  ): Promise<EventAllocation> {
    const updateData: Record<string, unknown> = {};
    if (allocation.eventName !== undefined)
      updateData.event_name = allocation.eventName;
    if (allocation.allocationAmount !== undefined)
      updateData.allocation_amount = allocation.allocationAmount;
    if (allocation.totalCollected !== undefined)
      updateData.total_collected = allocation.totalCollected;
    if (allocation.totalSpent !== undefined)
      updateData.total_spent = allocation.totalSpent;
    if (allocation.remainingBalance !== undefined)
      updateData.remaining_balance = allocation.remainingBalance;

    const { data, error } = await getSupabase()
      .from("event_allocations")
      .update(updateData)
      .eq("event_id", eventId)
      .select()
      .single();

    if (error) throw error;
    return {
      eventId: data.event_id,
      eventName: data.event_name,
      allocationAmount: data.allocation_amount,
      totalCollected: data.total_collected,
      totalSpent: data.total_spent,
      remainingBalance: data.remaining_balance,
    };
  },
};

// ============================================
// BOARD MEMBERS SERVICE
// ============================================
export const boardMembersService = {
  // Read-only from this service - board members are created via the
  // invite-officer script, not through db.ts - so only the cache-fallback
  // read pattern applies here.
  async listBoardMembers(): Promise<BoardMember[]> {
    return cachedRead<BoardMember>("board_members", async () => {
      const { data, error } = await getSupabase()
        .from("board_members")
        .select("*")
        .order("name");
      if (error) throw error;
      return (
        data?.map((item) => ({
          id: item.id,
          name: item.name,
          accountUserId: item.account_user_id ?? undefined,
        })) || []
      );
    });
  },
};

// ============================================
// FINANCIAL REPORTING SERVICE (derived, no DB writes)
// ============================================
const addToTotal = (
  totals: Map<string, number>,
  key: string,
  amount: number,
): void => {
  totals.set(key, (totals.get(key) ?? 0) + Math.max(0, amount));
};

/**
 * Reload UI data whenever a record in one of its Supabase source tables changes.
 * The caller remains the single source of truth by re-querying the database;
 * this helper never caches or writes duplicate summary data.
 */
export const subscribeToTables = (
  tables: readonly string[],
  onChange: () => void,
  channelPrefix = "db-live",
): (() => void) => {
  const sb = getSupabase();
  const channel = sb.channel(`${channelPrefix}-${crypto.randomUUID()}`);

  for (const table of tables) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      onChange,
    );
  }

  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
};

export const financialReportingService = {
  async getReport(): Promise<FinancialReport> {
    const [events, students, contributions, payments, transactions] =
      await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        contributionsService.getAll(),
        paymentsService.getAll(),
        transactionsService.getAll(),
      ]);
    const contribTotals = new Map<string, number>();
    const payTotals = new Map<string, number>();
    const collectionByEvent = new Map<string, number>();
    for (const c of contributions) {
      addToTotal(
        contribTotals,
        c.studentId + "\u0000" + c.eventId,
        c.amountPaid,
      );
    }
    for (const p of payments) {
      addToTotal(payTotals, p.studentId + "\u0000" + p.eventId, p.amount);
    }
    const allKeys = new Set([...contribTotals.keys(), ...payTotals.keys()]);
    for (const key of allKeys) {
      const collected = Math.max(
        contribTotals.get(key) ?? 0,
        payTotals.get(key) ?? 0,
      );
      const eventId = key.split("\u0000")[1];
      addToTotal(collectionByEvent, eventId, collected);
    }
    const incomeByEvent = new Map<string, number>();
    const spentByEvent = new Map<string, number>();
    let ledgerIncome = 0;
    let totalFundsSpent = 0;
    for (const tx of transactions) {
      const amount = Math.max(0, tx.amount);
      if (tx.type === "income") {
        ledgerIncome += amount;
        if (tx.eventId) addToTotal(incomeByEvent, tx.eventId, amount);
      } else {
        totalFundsSpent += amount;
        if (tx.eventId) addToTotal(spentByEvent, tx.eventId, amount);
      }
    }
    const studentCollections = [...collectionByEvent.values()].reduce(
      (s, a) => s + a,
      0,
    );
    const totalFundsCollected = studentCollections + ledgerIncome;
    const totalExpectedContributions = events.reduce((total, event) => {
      const allocation = Number(event.allocationAmount) || 0;
      return total + allocation * students.length;
    }, 0);
    const totalBudget = events.reduce(
      (s, e) => s + Math.max(0, e.allocationAmount),
      0,
    );
    return {
      summary: {
        totalBudget,
        totalFundsCollected,
        totalFundsSpent,
        remainingBudget: totalFundsCollected - totalFundsSpent,
        totalExpectedContributions,
      },
      eventAllocations: events
        .map((event) => {
          const totalCollected =
            (collectionByEvent.get(event.id) ?? 0) +
            (incomeByEvent.get(event.id) ?? 0);
          const totalSpent = spentByEvent.get(event.id) ?? 0;
          return {
            eventId: event.id,
            eventName: event.name,
            allocationAmount: Math.max(0, event.allocationAmount),
            totalCollected,
            totalSpent,
            remainingBalance: totalCollected - totalSpent,
          };
        })
        .sort((a, b) => a.eventName.localeCompare(b.eventName)),
    };
  },

  subscribe(onChange: () => void): () => void {
    return subscribeToTables(
      ["events", "students", "contributions", "payments", "transactions"],
      onChange,
      "financial-report",
    );
  },
};
