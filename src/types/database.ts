export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
          id: string;
          student_id: string;
          name: string;
          program: string;
          year_level: number;
          section: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          name: string;
          program: string;
          year_level: number;
          section: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          name?: string;
          program?: string;
          year_level?: number;
          section?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          name: string;
          allocation_amount: number;
          date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          allocation_amount?: number;
          date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          allocation_amount?: number;
          date?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      attendance_records: {
        Row: {
          id: string;
          student_id: string;
          event_id: string;
          event_name: string;
          date: string;
          status: 'present' | 'absent';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          event_id: string;
          event_name: string;
          date: string;
          status: 'present' | 'absent';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          event_id?: string;
          event_name?: string;
          date?: string;
          status?: 'present' | 'absent';
          created_at?: string;
          updated_at?: string;
        };
      };
      contribution_records: {
        Row: {
          id: string;
          student_id: string;
          event_id: string;
          event_name: string;
          required_amount: number;
          amount_paid: number;
          remaining_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          event_id: string;
          event_name: string;
          required_amount?: number;
          amount_paid?: number;
          remaining_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          event_id?: string;
          event_name?: string;
          required_amount?: number;
          amount_paid?: number;
          remaining_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_records: {
        Row: {
          id: string;
          student_id: string;
          student_name: string;
          event_id: string | null;
          event_name: string | null;
          amount: number;
          date: string;
          recorded_by: string;
          receipt_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          student_name: string;
          event_id?: string | null;
          event_name?: string | null;
          amount?: number;
          date: string;
          recorded_by: string;
          receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          student_name?: string;
          event_id?: string | null;
          event_name?: string | null;
          amount?: number;
          date?: string;
          recorded_by?: string;
          receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          date: string;
          description: string;
          event_id: string | null;
          event_name: string | null;
          amount: number;
          type: 'income' | 'expense';
          responsible_officer: string;
          receipt_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          description: string;
          event_id?: string | null;
          event_name?: string | null;
          amount?: number;
          type: 'income' | 'expense';
          responsible_officer: string;
          receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          description?: string;
          event_id?: string | null;
          event_name?: string | null;
          amount?: number;
          type?: 'income' | 'expense';
          responsible_officer?: string;
          receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      feedback_items: {
        Row: {
          id: string;
          type: 'inquiry' | 'complaint' | 'suggestion';
          title: string | null;
          message: string;
          student_name: string | null;
          student_id: string | null;
          is_anonymous: boolean;
          submitted_at: string;
          status: 'pending' | 'in-progress' | 'resolved';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: 'inquiry' | 'complaint' | 'suggestion';
          title?: string | null;
          message: string;
          student_name?: string | null;
          student_id?: string | null;
          is_anonymous?: boolean;
          submitted_at?: string;
          status?: 'pending' | 'in-progress' | 'resolved';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: 'inquiry' | 'complaint' | 'suggestion';
          title?: string | null;
          message?: string;
          student_name?: string | null;
          student_id?: string | null;
          is_anonymous?: boolean;
          submitted_at?: string;
          status?: 'pending' | 'in-progress' | 'resolved';
          created_at?: string;
          updated_at?: string;
        };
      };
      financial_summaries: {
        Row: {
          id: string;
          total_budget: number;
          total_funds_collected: number;
          total_funds_spent: number;
          remaining_budget: number;
          total_expected_contributions: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          total_budget?: number;
          total_funds_collected?: number;
          total_funds_spent?: number;
          remaining_budget?: number;
          total_expected_contributions?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          total_budget?: number;
          total_funds_collected?: number;
          total_funds_spent?: number;
          remaining_budget?: number;
          total_expected_contributions?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      event_allocations: {
        Row: {
          id: string;
          event_id: string;
          event_name: string;
          allocation_amount: number;
          total_collected: number;
          total_spent: number;
          remaining_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_name: string;
          allocation_amount?: number;
          total_collected?: number;
          total_spent?: number;
          remaining_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_name?: string;
          allocation_amount?: number;
          total_collected?: number;
          total_spent?: number;
          remaining_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
