import { supabase } from '@/lib/supabase';
import type { 
  Student, 
  Event, 
  AttendanceRecord, 
  ContributionRecord, 
  PaymentRecord,
  Transaction, 
  FeedbackItem, 
  FinancialSummary,
  EventAllocation
} from '@/types';

// ============================================
// STUDENTS SERVICE
// ============================================
export const studentsService = {
  async getAll(): Promise<Student[]> {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('name');

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      name: item.name,
      program: item.program,
      yearLevel: item.year_level,
      section: item.section,
    })) || [];
  },

  async getById(id: string): Promise<Student | null> {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return {
      id: data.id,
      studentId: data.student_id,
      name: data.name,
      program: data.program,
      yearLevel: data.year_level,
      section: data.section,
    };
  },

  async getByStudentId(studentId: string): Promise<Student | null> {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (error) return null;
    return {
      id: data.id,
      studentId: data.student_id,
      name: data.name,
      program: data.program,
      yearLevel: data.year_level,
      section: data.section,
    };
  },

  async getByName(name: string): Promise<Student | null> {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .ilike('name', `%${name}%`)
      .single();

    if (error) return null;
    return data ? {
      id: data.id,
      studentId: data.student_id,
      name: data.name,
      program: data.program,
      yearLevel: data.year_level,
      section: data.section,
    } : null;
  },

  async create(student: Omit<Student, 'id'>): Promise<Student> {
    const { data, error } = await supabase
      .from('students')
      .insert({
        student_id: student.studentId,
        name: student.name,
        program: student.program,
        year_level: student.yearLevel,
        section: student.section,
      })
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

  async update(id: string, student: Partial<Student>): Promise<Student> {
    const updateData: Record<string, unknown> = {};
    if (student.studentId !== undefined) updateData.student_id = student.studentId;
    if (student.name !== undefined) updateData.name = student.name;
    if (student.program !== undefined) updateData.program = student.program;
    if (student.yearLevel !== undefined) updateData.year_level = student.yearLevel;
    if (student.section !== undefined) updateData.section = student.section;

    const { data, error } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', id)
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async search(query: string): Promise<Student[]> {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .or(`name.ilike.%${query}%,student_id.ilike.%${query}%`)
      .order('name');

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      name: item.name,
      program: item.program,
      yearLevel: item.year_level,
      section: item.section,
    })) || [];
  },
};

// ============================================
// EVENTS SERVICE
// ============================================
export const eventsService = {
  async getAll(): Promise<Event[]> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      name: item.name,
      allocationAmount: item.allocation_amount,
      date: item.date,
    })) || [];
  },

  async getById(id: string): Promise<Event | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return {
      id: data.id,
      name: data.name,
      allocationAmount: data.allocation_amount,
      date: data.date,
    };
  },

  async create(event: Omit<Event, 'id'>): Promise<Event> {
    const { data, error } = await supabase
      .from('events')
      .insert({
        name: event.name,
        allocation_amount: event.allocationAmount,
        date: event.date,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      allocationAmount: data.allocation_amount,
      date: data.date,
    };
  },

  async update(id: string, event: Partial<Event>): Promise<Event> {
    const updateData: Record<string, unknown> = {};
    if (event.name !== undefined) updateData.name = event.name;
    if (event.allocationAmount !== undefined) updateData.allocation_amount = event.allocationAmount;
    if (event.date !== undefined) updateData.date = event.date;

    const { data, error } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      allocationAmount: data.allocation_amount,
      date: data.date,
    };
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// ============================================
// ATTENDANCE SERVICE
// ============================================
export const attendanceService = {
  async getAll(): Promise<AttendanceRecord[]> {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      eventId: item.event_id,
      eventName: item.event_name,
      date: item.date,
      status: item.status,
    })) || [];
  },

  async getByStudentId(studentId: string): Promise<AttendanceRecord[]> {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      eventId: item.event_id,
      eventName: item.event_name,
      date: item.date,
      status: item.status,
    })) || [];
  },

  async getByEventId(eventId: string): Promise<AttendanceRecord[]> {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('event_id', eventId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      eventId: item.event_id,
      eventName: item.event_name,
      date: item.date,
      status: item.status,
    })) || [];
  },

  async create(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        student_id: record.studentId,
        event_id: record.eventId,
        event_name: record.eventName,
        date: record.date,
        status: record.status,
      })
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
    };
  },

  async update(id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord> {
    const updateData: Record<string, unknown> = {};
    if (record.studentId !== undefined) updateData.student_id = record.studentId;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined) updateData.event_name = record.eventName;
    if (record.date !== undefined) updateData.date = record.date;
    if (record.status !== undefined) updateData.status = record.status;

    const { data, error } = await supabase
      .from('attendance_records')
      .update(updateData)
      .eq('id', id)
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
    };
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getStatsByEventId(eventId: string): Promise<{ present: number; absent: number; total: number }> {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('status')
      .eq('event_id', eventId);

    if (error) throw error;

    const present = data?.filter(r => r.status === 'present').length || 0;
    const absent = data?.filter(r => r.status === 'absent').length || 0;

    return { present, absent, total: present + absent };
  },
};

// ============================================
// CONTRIBUTIONS SERVICE
// ============================================
export const contributionsService = {
  async getAll(): Promise<ContributionRecord[]> {
    const { data, error } = await supabase
      .from('contribution_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      eventId: item.event_id,
      eventName: item.event_name,
      requiredAmount: item.required_amount,
      amountPaid: item.amount_paid,
      remainingBalance: item.remaining_balance,
    })) || [];
  },

  async getByStudentId(studentId: string): Promise<ContributionRecord[]> {
    const { data, error } = await supabase
      .from('contribution_records')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      eventId: item.event_id,
      eventName: item.event_name,
      requiredAmount: item.required_amount,
      amountPaid: item.amount_paid,
      remainingBalance: item.remaining_balance,
    })) || [];
  },

  async getByEventId(eventId: string): Promise<ContributionRecord[]> {
    const { data, error } = await supabase
      .from('contribution_records')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      eventId: item.event_id,
      eventName: item.event_name,
      requiredAmount: item.required_amount,
      amountPaid: item.amount_paid,
      remainingBalance: item.remaining_balance,
    })) || [];
  },

  async create(record: Omit<ContributionRecord, 'id'>): Promise<ContributionRecord> {
    const { data, error } = await supabase
      .from('contribution_records')
      .insert({
        student_id: record.studentId,
        event_id: record.eventId,
        event_name: record.eventName,
        required_amount: record.requiredAmount,
        amount_paid: record.amountPaid,
        remaining_balance: record.remainingBalance,
      })
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

  async update(id: string, record: Partial<ContributionRecord>): Promise<ContributionRecord> {
    const updateData: Record<string, unknown> = {};
    if (record.studentId !== undefined) updateData.student_id = record.studentId;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined) updateData.event_name = record.eventName;
    if (record.requiredAmount !== undefined) updateData.required_amount = record.requiredAmount;
    if (record.amountPaid !== undefined) updateData.amount_paid = record.amountPaid;
    if (record.remainingBalance !== undefined) updateData.remaining_balance = record.remainingBalance;

    const { data, error } = await supabase
      .from('contribution_records')
      .update(updateData)
      .eq('id', id)
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contribution_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// ============================================
// PAYMENTS SERVICE
// ============================================
export const paymentsService = {
  async getAll(): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
      .from('payment_records')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      studentName: item.student_name,
      eventId: item.event_id || undefined,
      eventName: item.event_name || undefined,
      amount: item.amount,
      date: item.date,
      receiptUrl: item.receipt_url || undefined,
      recordedBy: item.recorded_by,
    })) || [];
  },

  async getByStudentId(studentId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
      .from('payment_records')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      studentName: item.student_name,
      eventId: item.event_id || undefined,
      eventName: item.event_name || undefined,
      amount: item.amount,
      date: item.date,
      receiptUrl: item.receipt_url || undefined,
      recordedBy: item.recorded_by,
    })) || [];
  },

  async getByEventId(eventId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
      .from('payment_records')
      .select('*')
      .eq('event_id', eventId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      studentId: item.student_id,
      studentName: item.student_name,
      eventId: item.event_id || undefined,
      eventName: item.event_name || undefined,
      amount: item.amount,
      date: item.date,
      receiptUrl: item.receipt_url || undefined,
      recordedBy: item.recorded_by,
    })) || [];
  },

  async create(record: Omit<PaymentRecord, 'id'>): Promise<PaymentRecord> {
    const { data, error } = await supabase
      .from('payment_records')
      .insert({
        student_id: record.studentId,
        student_name: record.studentName,
        event_id: record.eventId,
        event_name: record.eventName,
        amount: record.amount,
        date: record.date,
        receipt_url: record.receiptUrl,
        recorded_by: record.recordedBy,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      studentId: data.student_id,
      studentName: data.student_name,
      eventId: data.event_id || undefined,
      eventName: data.event_name || undefined,
      amount: data.amount,
      date: data.date,
      receiptUrl: data.receipt_url || undefined,
      recordedBy: data.recorded_by,
    };
  },

  async update(id: string, record: Partial<PaymentRecord>): Promise<PaymentRecord> {
    const updateData: Record<string, unknown> = {};
    if (record.studentId !== undefined) updateData.student_id = record.studentId;
    if (record.studentName !== undefined) updateData.student_name = record.studentName;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined) updateData.event_name = record.eventName;
    if (record.amount !== undefined) updateData.amount = record.amount;
    if (record.date !== undefined) updateData.date = record.date;
    if (record.receiptUrl !== undefined) updateData.receipt_url = record.receiptUrl;
    if (record.recordedBy !== undefined) updateData.recorded_by = record.recordedBy;

    const { data, error } = await supabase
      .from('payment_records')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      studentId: data.student_id,
      studentName: data.student_name,
      eventId: data.event_id || undefined,
      eventName: data.event_name || undefined,
      amount: data.amount,
      date: data.date,
      receiptUrl: data.receipt_url || undefined,
      recordedBy: data.recorded_by,
    };
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('payment_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// ============================================
// TRANSACTIONS SERVICE
// ============================================
export const transactionsService = {
  async getAll(): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      date: item.date,
      description: item.description,
      eventId: item.event_id || undefined,
      eventName: item.event_name || undefined,
      amount: item.amount,
      type: item.type,
      responsibleOfficer: item.responsible_officer,
      receiptUrl: item.receipt_url || undefined,
    })) || [];
  },

  async getByEventId(eventId: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('event_id', eventId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      date: item.date,
      description: item.description,
      eventId: item.event_id || undefined,
      eventName: item.event_name || undefined,
      amount: item.amount,
      type: item.type,
      responsibleOfficer: item.responsible_officer,
      receiptUrl: item.receipt_url || undefined,
    })) || [];
  },

  async create(record: Omit<Transaction, 'id'>): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        date: record.date,
        description: record.description,
        event_id: record.eventId,
        event_name: record.eventName,
        amount: record.amount,
        type: record.type,
        responsible_officer: record.responsibleOfficer,
        receipt_url: record.receiptUrl,
      })
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

  async update(id: string, record: Partial<Transaction>): Promise<Transaction> {
    const updateData: Record<string, unknown> = {};
    if (record.date !== undefined) updateData.date = record.date;
    if (record.description !== undefined) updateData.description = record.description;
    if (record.eventId !== undefined) updateData.event_id = record.eventId;
    if (record.eventName !== undefined) updateData.event_name = record.eventName;
    if (record.amount !== undefined) updateData.amount = record.amount;
    if (record.type !== undefined) updateData.type = record.type;
    if (record.responsibleOfficer !== undefined) updateData.responsible_officer = record.responsibleOfficer;
    if (record.receiptUrl !== undefined) updateData.receipt_url = record.receiptUrl;

    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', id)
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getFinancialSummary(): Promise<{ income: number; expense: number; balance: number }> {
    const { data, error } = await supabase
      .from('transactions')
      .select('type, amount');

    if (error) throw error;

    const income = data?.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) || 0;
    const expense = data?.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0) || 0;

    return { income, expense, balance: income - expense };
  },
};

// ============================================
// FEEDBACK SERVICE
// ============================================
export const feedbackService = {
  async getAll(): Promise<FeedbackItem[]> {
    const { data, error } = await supabase
      .from('feedback_items')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      type: item.type,
      title: item.title || undefined,
      message: item.message,
      studentName: item.student_name || undefined,
      studentId: item.student_id || undefined,
      isAnonymous: item.is_anonymous,
      submittedAt: item.submitted_at,
      status: item.status,
    })) || [];
  },

  async getByType(type: FeedbackItem['type']): Promise<FeedbackItem[]> {
    const { data, error } = await supabase
      .from('feedback_items')
      .select('*')
      .eq('type', type)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      type: item.type,
      title: item.title || undefined,
      message: item.message,
      studentName: item.student_name || undefined,
      studentId: item.student_id || undefined,
      isAnonymous: item.is_anonymous,
      submittedAt: item.submitted_at,
      status: item.status,
    })) || [];
  },

  async getByStatus(status: FeedbackItem['status']): Promise<FeedbackItem[]> {
    const { data, error } = await supabase
      .from('feedback_items')
      .select('*')
      .eq('status', status)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      id: item.id,
      type: item.type,
      title: item.title || undefined,
      message: item.message,
      studentName: item.student_name || undefined,
      studentId: item.student_id || undefined,
      isAnonymous: item.is_anonymous,
      submittedAt: item.submitted_at,
      status: item.status,
    })) || [];
  },

  async create(item: Omit<FeedbackItem, 'id' | 'submittedAt'>): Promise<FeedbackItem> {
    const { data, error } = await supabase
      .from('feedback_items')
      .insert({
        type: item.type,
        title: item.title,
        message: item.message,
        student_name: item.studentName,
        student_id: item.studentId,
        is_anonymous: item.isAnonymous,
        status: item.status,
      })
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

  async update(id: string, item: Partial<FeedbackItem>): Promise<FeedbackItem> {
    const updateData: Record<string, unknown> = {};
    if (item.type !== undefined) updateData.type = item.type;
    if (item.title !== undefined) updateData.title = item.title;
    if (item.message !== undefined) updateData.message = item.message;
    if (item.studentName !== undefined) updateData.student_name = item.studentName;
    if (item.studentId !== undefined) updateData.student_id = item.studentId;
    if (item.isAnonymous !== undefined) updateData.is_anonymous = item.isAnonymous;
    if (item.status !== undefined) updateData.status = item.status;

    const { data, error } = await supabase
      .from('feedback_items')
      .update(updateData)
      .eq('id', id)
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('feedback_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async updateStatus(id: string, status: FeedbackItem['status']): Promise<void> {
    const { error } = await supabase
      .from('feedback_items')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  },
};

// ============================================
// FINANCIAL SUMMARY SERVICE
// ============================================
export const financialSummaryService = {
  async get(): Promise<FinancialSummary | null> {
    const { data, error } = await supabase
      .from('financial_summaries')
      .select('*')
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
    if (summary.totalBudget !== undefined) updateData.total_budget = summary.totalBudget;
    if (summary.totalFundsCollected !== undefined) updateData.total_funds_collected = summary.totalFundsCollected;
    if (summary.totalFundsSpent !== undefined) updateData.total_funds_spent = summary.totalFundsSpent;
    if (summary.remainingBudget !== undefined) updateData.remaining_budget = summary.remainingBudget;
    if (summary.totalExpectedContributions !== undefined) updateData.total_expected_contributions = summary.totalExpectedContributions;

    const { data, error } = await supabase
      .from('financial_summaries')
      .update(updateData)
      .eq('id', (await this.get())?.id || 1)
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
    const { data, error } = await supabase
      .from('event_allocations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data?.map(item => ({
      eventId: item.event_id,
      eventName: item.event_name,
      allocationAmount: item.allocation_amount,
      totalCollected: item.total_collected,
      totalSpent: item.total_spent,
      remainingBalance: item.remaining_balance,
    })) || [];
  },

  async getByEventId(eventId: string): Promise<EventAllocation | null> {
    const { data, error } = await supabase
      .from('event_allocations')
      .select('*')
      .eq('event_id', eventId)
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

  async create(allocation: Omit<EventAllocation, 'id'>): Promise<EventAllocation> {
    const { data, error } = await supabase
      .from('event_allocations')
      .insert({
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

  async update(eventId: string, allocation: Partial<EventAllocation>): Promise<EventAllocation> {
    const updateData: Record<string, unknown> = {};
    if (allocation.eventName !== undefined) updateData.event_name = allocation.eventName;
    if (allocation.allocationAmount !== undefined) updateData.allocation_amount = allocation.allocationAmount;
    if (allocation.totalCollected !== undefined) updateData.total_collected = allocation.totalCollected;
    if (allocation.totalSpent !== undefined) updateData.total_spent = allocation.totalSpent;
    if (allocation.remainingBalance !== undefined) updateData.remaining_balance = allocation.remainingBalance;

    const { data, error } = await supabase
      .from('event_allocations')
      .update(updateData)
      .eq('event_id', eventId)
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
