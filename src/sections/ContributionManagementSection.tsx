import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  Edit2,
  Trash2,
  User,
  Calendar,
  Save,
  Coins,
  FileText,
  CreditCard,
} from "lucide-react";
import SectionLoader from "@/components/SectionLoader";
import Skeleton from "@/components/Skeleton";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SummaryCard from "@/components/common/SummaryCard";
import Pagination from "@/components/common/Pagination";
import {
  contributionsService,
  studentsService,
  eventsService,
  paymentsService,
  subscribeToTables,
} from "@/services/db";
import type {
  ContributionRecord,
  PaymentRecord,
  Student,
  Event,
  UserRole,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDate, formatPeso, today } from "@/lib/format";
import { contributionStatus } from "@/lib/contributions";
import { autoCreateReceipt, officialReceiptNumber } from "@/lib/receipts";
import {
  pickField,
  parseAmount,
  normalizeStudentId,
  expandEventGroups,
} from "@/lib/spreadsheet";
import { useSpreadsheetImport } from "@/hooks/useSpreadsheetImport";
interface ContributionManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  staffName: string;
}

/** A contribution record enriched with the student's display info. */
interface ContributionRow extends ContributionRecord {
  studentName: string;
  studentDisplayId: string;
}

/** Form state for the Edit modal. */
interface ContributionForm {
  studentId: string;
  eventId: string;
  requiredAmount: number;
  amountPaid: number;
}

/** One parsed & matched (student, event) import row waiting to be upserted. */
interface ParsedContributionRow {
  student: Student;
  event: Event;
  requiredAmount: number;
  amountPaid: number;
}

const EMPTY_FORM: ContributionForm = {
  studentId: "",
  eventId: "",
  requiredAmount: 0,
  amountPaid: 0,
};

/** How many contribution rows are shown per table page. */
const PAGE_SIZE = 20;

export default function ContributionManagementSection({
  onBack,
  role,
  staffName,
}: ContributionManagementSectionProps) {
  const [records, setRecords] = useState<ContributionRow[]>([]);
  // Unenriched contribution rows (real student/event FKs intact), used to
  // look up a student+event's contribution while recording a payment —
  // `records` above overwrites `studentId` with the display ID, so it can't
  // be used for that lookup.
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ContributionRecord | null>(
    null,
  );
  const [form, setForm] = useState<ContributionForm>(EMPTY_FORM);

  // Filters
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    eventId: "",
    status: "",
  });
  // Debounce database searches so we don't query Supabase on every
  // individual keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  const [contributionToDelete, setContributionToDelete] =
    useState<ContributionRow | null>(null);

  // Table pagination — 20 rows per page.
  const [currentPage, setCurrentPage] = useState(1);
  const [totalContributions, setTotalContributions] = useState(0);
  const [contributionTotals, setContributionTotals] = useState({
    totalRequired: 0,
    totalPaid: 0,
    totalBalance: 0,
  });
  // Record Payment modal (merged in from the former Payments screen).
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    studentId: "",
    eventId: "",
    amount: 0,
  });
  const [paymentStudentSearch, setPaymentStudentSearch] = useState("");
  const [paymentStudentOpen, setPaymentStudentOpen] = useState(false);
  const paymentSearchRef = useRef<HTMLDivElement>(null);

  // While a bulk CSV/Excel import is running, each created row would
  // otherwise fire its own realtime "contributions changed" event and
  // reload (and re-render) the whole table — see the subscribeToTables
  // effect below and importContributionRows further down. This flag lets
  // the realtime callback skip those reloads until the import is done, at
  // which point importContributionRows reloads the table exactly once.
  const isImportingRef = useRef(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [
        contributionsPage,
        contributionTotalsData,
        allStudents,
        allEvents,
        paymentsData,
      ] = await Promise.all([
        contributionsService.getPage(
          currentPage - 1,
          PAGE_SIZE,
          debouncedSearchTerm,
          filters.eventId,
          filters.status,
        ),
        contributionsService.getTotals(),
        studentsService.getAll(),
        eventsService.getAll(),
        paymentsService.getAll(),
      ]);

      const studentById = new Map(allStudents.map((s) => [s.id, s]));

      const rows: ContributionRow[] = contributionsPage.data.map((record) => {
        const student = studentById.get(record.studentId);

        return {
          ...record,
          studentName: student?.name ?? "Unknown Student",
          studentDisplayId: student?.studentId ?? "—",
        };
      });

      setRecords(rows);
      setContributions(contributionsPage.data);
      setTotalContributions(contributionsPage.total);
      setContributionTotals(contributionTotalsData);
      setStudents(allStudents);
      setEvents(allEvents);
      setPayments(paymentsData);
    } catch (error) {
      console.error("Error loading contribution records:", error);
      toast.error("Failed to load contribution records");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchTerm, filters.eventId, filters.status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Records are always read from Supabase again after a related change, rather
  // than retaining a separate client-side copy of contribution data.
  useEffect(() => {
    return subscribeToTables(
      ["contributions", "students", "events", "payments"],
      () => {
        if (isImportingRef.current) return; // see isImportingRef above
        loadData();
      },
      "contribution-management",
    );
  }, [loadData]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );
  const contributionEvents = useMemo(
    () => events.filter((event) => event.allocationAmount > 0),
    [events],
  );

  // Summary stats
  const { totalRequired, totalPaid } = contributionTotals;

  const computedBalance = Math.max(0, form.requiredAmount - form.amountPaid);

  // Reset back to page 1 whenever the search term or filters change the
  // result set, so the user isn't stranded on a now-empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters.eventId, filters.status]);
  const totalPages = Math.max(1, Math.ceil(totalContributions / PAGE_SIZE)); // Clamp back onto a valid page if a delete or realtime update shrinks // the result set out from under the current page.
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const paginatedRecords = records;

  // ---------------------------------------------------------------------------
  // Record Payment (merged in from the former Payments screen — recording a
  // payment auto-creates the student's contribution record if one doesn't
  // exist yet, so a separate "Add Contribution" flow is unnecessary).
  // ---------------------------------------------------------------------------

  const paymentStudentMatches = useMemo(() => {
    const query = paymentStudentSearch.trim().toLowerCase();
    if (!query) return [];
    return students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.studentId.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [paymentStudentSearch, students]);

  const selectedPaymentEvent = events.find(
    (event) => event.id === paymentForm.eventId,
  );
  const selectedPaymentContribution = contributions.find(
    (contribution) =>
      contribution.studentId === paymentForm.studentId &&
      contribution.eventId === paymentForm.eventId,
  );
  const requiredPaymentAmount =
    selectedPaymentContribution?.requiredAmount ??
    selectedPaymentEvent?.allocationAmount;
  const selectedPaymentStatus = selectedPaymentContribution
    ? contributionStatus(selectedPaymentContribution)
    : requiredPaymentAmount !== undefined
      ? contributionStatus({
          amountPaid: 0,
          remainingBalance: requiredPaymentAmount,
        })
      : null;

  // Close the picker when clicking anywhere outside of it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        paymentSearchRef.current &&
        !paymentSearchRef.current.contains(event.target as Node)
      ) {
        setPaymentStudentOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePaymentStudentSelect = (student: Student) => {
    setPaymentForm((prev) => ({ ...prev, studentId: student.id }));
    setPaymentStudentSearch(`${student.name} (${student.studentId})`);
    setPaymentStudentOpen(false);
  };

  const openPaymentModal = () => {
    setPaymentForm({ studentId: "", eventId: "", amount: 0 });
    setPaymentStudentSearch("");
    setPaymentStudentOpen(false);
    setShowPaymentModal(true);
  };
  const validatePaymentAmount = (
    amount: number,
    requiredAmount: number,
    currentPaid = 0,
  ): string | null => {
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Payment amount must be greater than zero.";
    }

    const remainingBalance = requiredAmount - currentPaid;

    if (amount > remainingBalance) {
      return `Payment exceeds the remaining balance of ₱${remainingBalance.toFixed(2)}.`;
    }

    return null;
  };

  type PaymentImportMode = "add" | "replace" | "required";

  /**
   * Shared payment path for manual recording and spreadsheet imports.
   *
   * Manual installment entry remains additive, while spreadsheet Amount Paid is
   * a snapshot that replaces the current total. The standard required-payment
   * path validates and records the event's exact required amount. In all cases
   * there is one current payment row and the contribution is recalculated from
   * the resulting total.
   */
  const savePaymentForStudentEvent = async (options: {
    student: Student;
    event: Event;
    amount: number;
    requiredAmount?: number;
    mode: PaymentImportMode;
    imported?: boolean;
  }): Promise<boolean> => {
    const {
      student,
      event,
      amount,
      mode,
      imported = false,
    } = options;
    const canIssueReceipts =
      role === "admin" || role === "treasurer" || role === "auditor";
    let contribution = await contributionsService.getByStudentAndEvent(
      student.id,
      event.id,
    );
    const requiredAmount =
      options.requiredAmount ??
      contribution?.requiredAmount ??
      event.allocationAmount;

    if (mode === "required") {
      // Validate before creating a contribution, receipt, or payment so an
      // invalid standard payment cannot leave behind a partial side effect.
      paymentsService.assertRequiredPaymentAmount(amount, requiredAmount);
    }

    if (!contribution) {
      try {
        contribution = await contributionsService.create({
          studentId: student.id,
          eventId: event.id,
          eventName: event.name,
          requiredAmount,
          amountPaid: 0,
          remainingBalance: requiredAmount,
        });
      } catch (createError) {
        // The unique student/event index may have been won by another writer.
        contribution = await contributionsService.getByStudentAndEvent(
          student.id,
          event.id,
        );
        if (!contribution) throw createError;
      }
    }

    const validationError =
      mode === "add"
        ? validatePaymentAmount(
            amount,
            contribution.requiredAmount,
            contribution.amountPaid,
          )
        : mode === "replace" && (!Number.isFinite(amount) || amount <= 0)
          ? "Payment amount must be greater than zero."
          : mode === "replace" && amount > requiredAmount
            ? `Payment exceeds the required amount of ₱${requiredAmount.toFixed(2)}.`
            : null;

    if (validationError) throw new Error(validationError);

    const updatedAmountPaid =
      mode === "add" ? contribution.amountPaid + amount : amount;
    const updatedRemainingBalance = Math.max(
      0,
      requiredAmount - updatedAmountPaid,
    );
    const existingPayment = await paymentsService.getByStudentAndEvent(
      student.id,
      event.id,
    );

    let receiptUrl: string | undefined;
    let receiptNumber: string | undefined;
    const paymentAmountChanged =
      !existingPayment || existingPayment.amount !== updatedAmountPaid;
    if (
      canIssueReceipts &&
      (paymentAmountChanged || !existingPayment.receiptUrl)
    ) {
      try {
        receiptNumber = await officialReceiptNumber();
        receiptUrl = await autoCreateReceipt({
          tag: "PAYMENT",
          receiptNumber,
          issuedTo: student.name,
          eventName: event.name,
          description: `Payment for ${event.name}${imported ? " (imported)" : ""}`,
          amount: updatedAmountPaid,
          type: "income",
          date: today(),
          recordedBy: staffName || "Council Officer",
        });
      } catch (receiptError) {
        console.warn("Auto receipt generation failed:", receiptError);
      }
    }

    const paymentRecord = {
      studentId: student.id,
      studentName: student.name,
      eventId: event.id,
      eventName: event.name,
      contributionId: contribution.id,
      amount: updatedAmountPaid,
      date: today(),
      recordedBy: staffName || "Council Officer",
      receiptUrl: receiptUrl ?? existingPayment?.receiptUrl,
      orNumber: receiptNumber ?? existingPayment?.orNumber,
    };

    if (mode === "required") {
      await paymentsService.upsertRequiredPayment(paymentRecord, requiredAmount);
    } else {
      await paymentsService.upsertForStudentAndEvent(paymentRecord);
    }

    await contributionsService.update(contribution.id, {
      eventName: event.name,
      requiredAmount,
      amountPaid: updatedAmountPaid,
      remainingBalance: updatedRemainingBalance,
    });

    return receiptUrl !== undefined;
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const student = students.find((s) => s.id === paymentForm.studentId);
      const event = events.find((e) => e.id === paymentForm.eventId);

      if (!student || !event) {
        toast.error("Please select both student and event");
        return;
      }

      const receiptIssued = await savePaymentForStudentEvent({
        student,
        event,
        amount: paymentForm.amount,
        mode: "required",
      });

      if (receiptIssued) {
        toast.success(
          "An official receipt was generated and attached automatically.",
        );
      }

      toast.success("Payment recorded successfully!");
      setShowPaymentModal(false);
      setPaymentForm({ studentId: "", eventId: "", amount: 0 });
      setPaymentStudentSearch("");
      setPaymentStudentOpen(false);

      await loadData();
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to record payment",
      );
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (record: ContributionRow) => {
    setEditingRecord(record);
    setForm({
      studentId: record.studentId,
      eventId: record.eventId,
      requiredAmount: record.requiredAmount,
      amountPaid: record.amountPaid,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    // Basic validation
    if (!form.studentId || !form.eventId) {
      toast.error("Please select both a student and an event");
      return;
    }
    if (form.requiredAmount <= 0) {
      toast.error("Required amount must be greater than zero");
      return;
    }
    if (form.amountPaid < 0) {
      toast.error("Amount paid cannot be negative");
      return;
    }

    const student = students.find((s) => s.id === form.studentId);
    const event = events.find((e) => e.id === form.eventId);
    if (!student || !event) {
      toast.error("Selected student or event no longer exists");
      return;
    }

    // One contribution record per student + event combination. `records`
    // only holds the current table page, so it can't reliably catch a
    // conflict sitting on a different page -- check the database directly
    // for this specific pair instead (this is also enforced by a UNIQUE
    // constraint on the table itself as the last line of defense).
    try {
      const existing = await contributionsService.getByStudentAndEvent(
        form.studentId,
        form.eventId,
      );
      if (existing && existing.id !== editingRecord?.id) {
        toast.error(
          `${student.name} already has a contribution record for ${event.name}.`,
        );
        return;
      }
    } catch (error) {
      console.error("Error checking for an existing contribution:", error);
      toast.error("Failed to save contribution record");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        studentId: form.studentId,
        eventId: form.eventId,
        eventName: event.name,
        requiredAmount: form.requiredAmount,
        amountPaid: form.amountPaid,
        remainingBalance: computedBalance,
      };

      const enrich = (record: ContributionRecord): ContributionRow => {
        const studentInfo = students.find((s) => s.id === record.studentId);

        return {
          ...record,
          studentName: studentInfo?.name ?? "Unknown Student",
          studentDisplayId: studentInfo?.studentId ?? "—",
        };
      };
      if (editingRecord) {
        const updated = await contributionsService.update(
          editingRecord.id,
          payload,
        );
        setRecords(
          records.map((r) => (r.id === editingRecord.id ? enrich(updated) : r)),
        );
        toast.success("Contribution updated successfully");
      } else {
        const created = await contributionsService.create(payload);
        setRecords([...records, enrich(created)]);
        toast.success("Contribution added successfully");
      }

      setShowModal(false);
      setEditingRecord(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      console.error("Error saving contribution record:", error);
      toast.error("Failed to save contribution record");
    } finally {
      setSaving(false);
    }
  };

  const handleContributionDelete = (record: ContributionRow) => {
    setContributionToDelete(record);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteContribution = async () => {
    if (!contributionToDelete) return;

    try {
      await contributionsService.delete(contributionToDelete.id);

      setRecords((prev) =>
        prev.filter((record) => record.id !== contributionToDelete.id),
      );

      toast.success(
        `${contributionToDelete.studentName}'s contribution record has been deleted.`,
      );

      setShowDeleteConfirm(false);
      setContributionToDelete(null);
    } catch (error) {
      console.error("Error deleting contribution:", error);

      toast.error(
        `Failed to delete ${contributionToDelete.studentName}'s contribution record.`,
      );
    }
  };
  // ---------------------------------------------------------------------------
  // CSV / Excel import
  // ---------------------------------------------------------------------------

  const importContributionRows = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) {
      toast.error("File is empty or invalid");
      return;
    }

    let successfulImports = 0;
    let importFailures = 0;
    let receiptsIssued = 0;
    // Lookup tables. Student ID is preferred; an unambiguous student name is
    // also supported for files that identify students by name only.
    const studentById = new Map<string, Student | null>();
    for (const student of students) {
      const key = normalizeStudentId(student.studentId).toLowerCase();
      studentById.set(key, studentById.has(key) ? null : student);
    }
    const studentByName = new Map<string, Student | null>();
    for (const student of students) {
      const key = student.name.trim().toLowerCase();
      studentByName.set(key, studentByName.has(key) ? null : student);
    }
    const eventByName = new Map<string, Event | null>();
    for (const event of events) {
      const key = event.name.trim().toLowerCase();
      eventByName.set(key, eventByName.has(key) ? null : event);
    }

    const parsed: ParsedContributionRow[] = [];

    let unmatchedStudent = 0;
    let unmatchedEvent = 0;
    let invalidAmount = 0;

    for (const row of rows) {
      const fileStudentId = pickField(
        row,
        "studentid",
        "studentno",
        "studentnumber",
        "studid",
        "idnumber",
        "lrn",
        "id",
      );
      const fileStudentName = pickField(
        row,
        "student",
        "name",
        "fullname",
        "studentname",
      );

      const student =
        (fileStudentId
          ? studentById.get(normalizeStudentId(fileStudentId).toLowerCase())
          : undefined) ??
        (fileStudentName
          ? studentByName.get(fileStudentName.toLowerCase())
          : undefined);

      if (!student) {
        unmatchedStudent++;
        continue;
      }

      // A row can contain either:
      //   Event / Required Amount / Amount Paid
      //
      // or multiple repeated groups:
      //   Event / Required Amount / Amount Paid /
      //   Event / Required Amount / Amount Paid / ...
      const groups = expandEventGroups(row);

      if (groups.length === 0) {
        unmatchedEvent++;
        continue;
      }

      for (const group of groups) {
        const event = eventByName.get(group.eventName.trim().toLowerCase());

        if (!event) {
          unmatchedEvent++;
          continue;
        }

        const requiredAmountValue = group.requiredAmount.trim();
        const requiredAmount = requiredAmountValue
          ? parseAmount(requiredAmountValue)
          : event.allocationAmount;
        const amountPaid = parseAmount(group.amountPaid);

        // Required amount must be a valid positive amount.
        if (requiredAmount === null || requiredAmount <= 0) {
          invalidAmount++;
          continue;
        }

        // Blank cells mean "no update". Do not turn them into zero and do not
        // overwrite a previously recorded payment with an empty spreadsheet
        // cell. Zero is also ignored because it is not a payment receipt.
        if (amountPaid === null || amountPaid === 0) {
          continue;
        }

        // Paid amount cannot be negative or greater than the required amount.
        if (amountPaid < 0 || amountPaid > requiredAmount) {
          invalidAmount++;

          console.warn(
            `Skipped invalid amount: ${student.studentId} / ${event.name} ` +
              `(required ₱${requiredAmount}, paid ₱${amountPaid})`,
          );

          continue;
        }

        parsed.push({
          student,
          event,
          requiredAmount,
          amountPaid,
        });
      }
    }

    if (parsed.length === 0) {
      toast.error(
        "No valid rows found. Expected columns: Student ID / Name, then Event, Required Amount, Amount Paid (repeat that trio for each additional event).",
      );
      return;
    }

    // Pause realtime-triggered reloads during the import.
    isImportingRef.current = true;

    toast.info(`Importing ${parsed.length} contribution(s)...`);

    try {
      // Process the complete dataset in order. Each iteration uses its own
      // immutable parsed item and waits for all payment, contribution, and
      // receipt operations to finish before moving to the next item. This is
      // deliberately not rows.forEach(async ...) or a shared mutable row:
      // neither can stop the import after the first asynchronous operation or
      // accidentally save the next student's data under the previous student.
      for (const item of parsed) {
        try {
          const receiptIssued = await savePaymentForStudentEvent({
            student: item.student,
            event: item.event,
            requiredAmount: item.requiredAmount,
            amount: item.amountPaid,
            mode: "replace",
            imported: true,
          });
          successfulImports++;
          if (receiptIssued) receiptsIssued++;
        } catch (error) {
          importFailures++;
          console.error("Error importing a contribution row:", error);
        }
      }

      // Combine all reasons rows may have been skipped.
      const totalSkipped = unmatchedStudent + unmatchedEvent + invalidAmount;

      const parts = [`${successfulImports} contribution(s) imported`];
      if (importFailures > 0) {
        parts.push(`${importFailures} contribution(s) failed`);
      }

      if (receiptsIssued > 0) {
        parts.push(`${receiptsIssued} receipt(s) generated`);
      }

      if (totalSkipped > 0) {
        parts.push(`${totalSkipped} skipped`);
      }

      toast.success(parts.join(", "));
    } catch (error) {
      console.error("Error importing contribution records:", error);

      toast.error("Failed to import contribution records");
    } finally {
      isImportingRef.current = false;
      await loadData();
    }
  };

  // Shared CSV / Excel file-read shell + importing state (row mapping + dedupe
  // handled by importContributionRows above).
  const { importing, handleFileSelected, importInputRef } =
    useSpreadsheetImport({
      onRows: importContributionRows,
    });

  return (
    <SectionLayout
      title="Contributions & Payments"
      subtitle="Track balances, record payments, and manage each student's contribution to every event"
      onBack={onBack}
      headerActions={
        <>
          <button
            onClick={() => importInputRef.current?.click()}
            className="glass-button px-4 py-2.5 text-sm w-fit"
            disabled={loading || importing}
            title="Import contribution records from a CSV (.csv) or Excel (.xlsx) file. Expected columns: Student ID / Name, then Event, Required Amount, Amount Paid — repeat that trio for each additional event (as in the official Student Body tracking sheet). A receipt is generated automatically for every imported row with a payment."
          >
            {importing ? (
              <Skeleton className="h-4 w-4 rounded-full" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span>{importing ? "Importing..." : "Upload CSV / Excel"}</span>
          </button>
          <button
            onClick={openPaymentModal}
            className="btn-primary px-4 py-2.5 text-sm w-fit"
            disabled={loading || importing}
          >
            <CreditCard className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </>
      }
    >
      {/* Hidden file input for CSV / Excel import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Summary + Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_250px] gap-4 mb-4">
        {/* Recent Payments - Large Left Panel */}
        <div className="glass-card p-4 lg:p-5 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-red/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-red" />
            </div>

            <div>
              <h3 className="font-display font-semibold text-dark">
                Recent Payments
              </h3>
              <p className="text-xs text-text-secondary">
                Latest recorded student payments
              </p>
            </div>
          </div>

          {payments.length === 0 ? (
            <SectionEmptyState
              message="No payments recorded yet"
              icon={CreditCard}
              compact
            />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {payments.slice(0, 8).map((payment) => {
                const paymentContribution = contributions.find(
                  (contribution) =>
                    contribution.id === payment.contributionId ||
                    (contribution.studentId === payment.studentId &&
                      contribution.eventId === payment.eventId),
                );

                const paymentStatus = paymentContribution
                  ? contributionStatus(paymentContribution)
                  : null;

                return (
                  <div
                    key={payment.id}
                    className="glass-card p-3 min-w-[220px] shrink-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-dark truncate">
                          {payment.studentName}
                        </p>

                        <p className="text-xs text-text-secondary truncate">
                          {payment.eventName}
                        </p>

                        <p className="text-xs text-text-secondary/70">
                          {formatDate(payment.date)}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-semibold text-green-600">
                          {formatPeso(payment.amount)}
                        </p>

                        {paymentStatus && (
                          <p
                            className={`text-xs font-semibold ${paymentStatus.className}`}
                          >
                            {paymentStatus.label}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary Cards - Right Side */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          <SummaryCard
            color="blue"
            value={totalContributions.toLocaleString()}
            label="Total Records"
            subtitle="contribution records"
            compact
          />

          <SummaryCard
            color="purple"
            value={formatPeso(totalRequired)}
            label="Total Collectable"
            subtitle="required contributions"
            compact
          />

          <SummaryCard
            color="green"
            value={formatPeso(totalPaid)}
            label="Total Collected"
            subtitle="payments received"
            compact
          />
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search by student name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="glass-input pl-10 pr-4 py-2 text-sm w-full"
            disabled={loading}
          />
        </div>
        <select
          value={filters.eventId}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              eventId: e.target.value,
            }))
          }
          className="glass-input px-4 py-2 text-sm"
          disabled={loading}
        >
          <option value="">All Events</option>
          {contributionEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              status: e.target.value,
            }))
          }
          className="glass-input px-4 py-2 text-sm"
          disabled={loading}
        >
          <option value="">All Statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial Payment</option>
          <option value="paid">Fully Paid</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && <SectionLoader message="Loading contribution records..." />}

      {/* Records Table */}
      {!loading && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Event</th>
                  <th className="text-right">Required</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => {
                  const status = contributionStatus(record);
                  return (
                    <tr key={record.id} className="group">
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-red/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-red" />
                          </div>
                          <div>
                            <span className="font-medium text-dark block">
                              {record.studentName}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {record.studentDisplayId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-text-secondary" />
                          <span className="text-text-secondary">
                            {record.eventName}
                          </span>
                        </div>
                      </td>
                      <td className="text-right text-text-secondary">
                        {formatPeso(record.requiredAmount)}
                      </td>
                      <td className="text-right font-medium text-green-600">
                        {formatPeso(record.amountPaid)}
                      </td>
                      <td className="text-right text-text-secondary">
                        {formatPeso(record.remainingBalance)}
                      </td>
                      <td className={`font-medium ${status.className}`}>
                        {status.label}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(record)}
                            className="p-2 rounded-lg"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleContributionDelete(record)}
                            className="p-2 rounded-lg hover:bg-red-500/10"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-red" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {records.length === 0 && (
            <SectionEmptyState
              message="No contribution records found"
              icon={Coins}
              compact
            />
          )}
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">
        <span>
          Total Records:{" "}
          <strong className="text-dark">{totalContributions}</strong>
        </span>
        <span>
          Filtered: <strong className="text-dark">{records.length}</strong>
        </span>
      </div>

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        totalItems={totalContributions}
        startIndex={(currentPage - 1) * PAGE_SIZE}
        endIndex={(currentPage - 1) * PAGE_SIZE + paginatedRecords.length}
        onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
        onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        onJump={setCurrentPage}
      />

      {/* Add/Edit Modal */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setShowModal(false);
            setEditingRecord(null);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Edit Contribution
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Student
              </label>
              <select
                value={form.studentId}
                onChange={(e) =>
                  setForm({ ...form, studentId: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
                disabled={saving}
              >
                <option value="">Select student...</option>
                {sortedStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.studentId} – {student.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Event
              </label>
              <select
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                className="glass-input w-full px-4 py-2"
                disabled={saving}
              >
                <option value="">Select event...</option>
                {contributionEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Required Amount (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.requiredAmount || ""}
                  onChange={(e) =>
                    setForm({ ...form, requiredAmount: Number(e.target.value) })
                  }
                  className="glass-input w-full px-4 py-2"
                  placeholder="e.g., 150"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Amount Paid (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.amountPaid || ""}
                  onChange={(e) =>
                    setForm({ ...form, amountPaid: Number(e.target.value) })
                  }
                  className="glass-input w-full px-4 py-2"
                  placeholder="e.g., 0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="rounded-xl bg-white/30 border border-white/50 px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-text-secondary">Remaining Balance</span>
              <span
                className={`font-semibold ${computedBalance > 0 ? "text-red-500" : "text-green-600"}`}
              >
                {formatPeso(computedBalance)}
              </span>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingRecord(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={
                  saving ||
                  !form.studentId ||
                  !form.eventId ||
                  form.requiredAmount <= 0
                }
              >
                {saving ? (
                  <>
                    <Skeleton className="h-4 w-4 rounded-full" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Update
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Payment Modal (merged in from the former Payments screen) */}
      <Dialog
        open={showPaymentModal}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setShowPaymentModal(false);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-red" />
              Record Payment
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 mt-4">
            <div ref={paymentSearchRef} className="relative">
              <label className="block text-sm font-medium text-dark mb-1">
                Student
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={paymentStudentSearch}
                  onChange={(e) => {
                    setPaymentStudentSearch(e.target.value);
                    setPaymentStudentOpen(true);
                    if (!e.target.value) {
                      setPaymentForm((prev) => ({ ...prev, studentId: "" }));
                    }
                  }}
                  onFocus={() => setPaymentStudentOpen(true)}
                  placeholder="Search by name or student ID..."
                  className="glass-input w-full pl-10 pr-4 py-2"
                  disabled={saving}
                  autoComplete="off"
                />
              </div>
              {paymentStudentOpen && paymentStudentMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full glass-card-strong max-h-56 overflow-y-auto">
                  {paymentStudentMatches.map((student) => (
                    <button
                      type="button"
                      key={student.id}
                      onClick={() => handlePaymentStudentSelect(student)}
                      className="w-full text-left px-4 py-2 hover:bg-white/40 flex items-center gap-2"
                    >
                      <User className="w-3.5 h-3.5 text-text-secondary" />
                      <span className="text-sm text-dark">
                        {student.name}{" "}
                        <span className="text-text-secondary flex items-left">
                          ({student.studentId})
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Event
              </label>
              <select
                value={paymentForm.eventId}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    eventId: e.target.value,
                  }))
                }
                className="glass-input w-full px-4 py-2"
                disabled={saving}
              >
                <option value="">Select event...</option>
                {contributionEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Amount (₱)
              </label>
              <div className="relative">
                <span className="text-text-secondary absolute left-3 top-1/2 -translate-y-1/2">₱</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentForm.amount || ""}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      amount: Number(e.target.value),
                    }))
                  }
                  className="glass-input w-full pl-10 pr-4 py-2"
                  placeholder="e.g., 150"
                  disabled={saving}
                />
              </div>
            </div>

            {paymentForm.studentId && paymentForm.eventId && (
              <div className="rounded-xl bg-white/30 border border-white/50 px-4 py-3 space-y-1.5 text-sm">
                {requiredPaymentAmount !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Required</span>
                    <span className="font-medium text-dark">
                      {formatPeso(requiredPaymentAmount)}
                    </span>
                  </div>
                )}
                {selectedPaymentContribution && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Already Paid</span>
                    <span className="font-medium text-dark">
                      {formatPeso(selectedPaymentContribution.amountPaid)}
                    </span>
                  </div>
                )}
                {selectedPaymentStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Status</span>
                    <span
                      className={`font-semibold ${selectedPaymentStatus.className}`}
                    >
                      {selectedPaymentStatus.label}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={
                  saving ||
                  !paymentForm.studentId ||
                  !paymentForm.eventId ||
                  paymentForm.amount <= 0
                }
              >
                {saving ? (
                  <>
                    <Skeleton className="h-4 w-4 rounded-full" />
                    Recording...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Record Payment
                  </>
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Contribution Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setContributionToDelete(null);
        }}
        onConfirm={confirmDeleteContribution}
        title="Delete Contribution"
        description={`Are you sure you want to delete the contribution record for ${contributionToDelete?.studentName ?? "this student"}?`}
        warningText={`This action cannot be undone. This student's contribution record for ${contributionToDelete?.eventName ?? ""} will be permanently removed.`}
        confirmLabel="Delete Contribution"
      />
    </SectionLayout>
  );
}
