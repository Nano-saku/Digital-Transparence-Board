import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  Edit2,
  Trash2,
  User,
  Calendar,
  Save,
  Loader2,
  Coins,
  FileText,
  CreditCard,
  DollarSign,
} from "lucide-react";
import SectionLoader from "@/components/SectionLoader";
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
import { useSearch } from "@/hooks/useSearch";
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

/** One parsed & matched (student, event) import row waiting to be created. */
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
        contributionsService.getPage(currentPage - 1, PAGE_SIZE),
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
  }, [currentPage]);

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
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.name.localeCompare(b.name)),
    [events],
  );

  const {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    filtered: filteredRecords,
  } = useSearch<ContributionRow>({
    items: records,
    searchKeys: ["studentName", "studentDisplayId"],
    filters: {
      eventId: (r) => r.eventId,
      status: (r) => contributionStatus(r).label,
    },
  });

  // Summary stats
  const { totalRequired, totalPaid } = contributionTotals;

  const computedBalance = Math.max(0, form.requiredAmount - form.amountPaid);

  // Reset back to page 1 whenever the search term or filters change the
  // result set, so the user isn't stranded on a now-empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters.eventId, filters.status]);

  const totalPages = Math.max(1, Math.ceil(totalContributions / PAGE_SIZE));
  // Clamp back onto a valid page if a delete or realtime update shrinks the
  // result set out from under the page the user is currently viewing.
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const paginatedRecords = filteredRecords;

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

      // Resolve the contribution record first (create it if this student has
      // no row for the event yet), so the payment can be created already
      // linked to it via contributionId.
      let contribution = await contributionsService.getByStudentAndEvent(
        student.id,
        event.id,
      );
      if (!contribution) {
        contribution = await contributionsService.create({
          studentId: student.id,
          eventId: event.id,
          eventName: event.name,
          requiredAmount: event.allocationAmount,
          amountPaid: 0,
          remainingBalance: event.allocationAmount,
        });
      }
      const validationError = validatePaymentAmount(
        paymentForm.amount,
        contribution.requiredAmount,
        contribution.amountPaid,
      );

      if (validationError) {
        toast.error(validationError);
        return;
      }
      // An official receipt is generated automatically (as SVG, uploaded to
      // the "receipts" Storage bucket) and attached to the payment.
      let receiptUrl: string | undefined;
      if (role === "admin" || role === "treasurer" || role === "auditor") {
        try {
          const orNumber = await officialReceiptNumber();
          receiptUrl = await autoCreateReceipt({
            tag: "PAYMENT",
            receiptNumber: orNumber,
            issuedTo: student.name,
            eventName: event.name,
            description: `Payment for ${event.name}`,
            amount: paymentForm.amount,
            type: "income",
            date: today(),
            recordedBy: staffName || "Council Officer",
          });
          toast.success(
            "An official receipt was generated and attached automatically.",
          );
        } catch (receiptError) {
          console.warn("Auto receipt generation failed:", receiptError);
        }
      }

      await paymentsService.create({
        studentId: paymentForm.studentId,
        studentName: student.name,
        eventId: paymentForm.eventId,
        eventName: event.name,
        contributionId: contribution.id,
        amount: paymentForm.amount,
        date: today(),
        recordedBy: staffName || "Council Officer",
        receiptUrl,
      });

      await contributionsService.update(contribution.id, {
        amountPaid: contribution.amountPaid + paymentForm.amount,
        remainingBalance: Math.max(
          0,
          contribution.remainingBalance - paymentForm.amount,
        ),
      });

      toast.success("Payment recorded successfully!");
      setShowPaymentModal(false);
      setPaymentForm({ studentId: "", eventId: "", amount: 0 });
      setPaymentStudentSearch("");
      setPaymentStudentOpen(false);

      await loadData();
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error("Failed to record payment");
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

    // One contribution record per student + event combination.
    const conflict = records.find(
      (r) =>
        (editingRecord ? r.id !== editingRecord.id : true) &&
        r.studentId === form.studentId &&
        r.eventId === form.eventId,
    );
    if (conflict) {
      toast.error(
        "This student already has a contribution record for that event",
      );
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

    const canIssueReceipts =
      role === "admin" || role === "treasurer" || role === "auditor";

    let successfulImports = 0;
    let importFailures = 0;
    let receiptsIssued = 0;
    let receiptFailures = 0;

    // Lookup tables (case-insensitive) so rows can reference the student by
    // ID or by full name, and the event by name.
    const studentById = new Map(
      students.map((s) => [normalizeStudentId(s.studentId).toLowerCase(), s]),
    );

    const studentByName = new Map(
      students.map((s) => [s.name.toLowerCase(), s]),
    );

    const eventByName = new Map(events.map((e) => [e.name.toLowerCase(), e]));

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

      const studentName = pickField(row, "name", "fullname", "studentname");

      const student =
        studentById.get(normalizeStudentId(fileStudentId).toLowerCase()) ??
        studentByName.get(studentName.toLowerCase());

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
        const event = eventByName.get(group.eventName.toLowerCase());

        if (!event) {
          unmatchedEvent++;
          continue;
        }

        const requiredAmount = parseAmount(group.requiredAmount);
        const amountPaid = parseAmount(group.amountPaid);

        // Required amount must be a valid positive amount.
        if (requiredAmount <= 0) {
          invalidAmount++;
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

        // IMPORTANT:
        // Do NOT skip a contribution just because the current user cannot
        // issue receipts.
        //
        // The contribution and its historical Amount Paid should still be
        // imported. Receipt/payment creation is handled separately below
        // and remains restricted by canIssueReceipts.

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

    // Skip rows that already have a contribution record, or are duplicated
    // within the file itself.
    //
    // `contributions` contains the raw records with real database student IDs,
    // unlike `records`, which is used for display.
    const existingKeys = new Set(
      contributions.map(
        (r) => `${r.studentId.toLowerCase()}|${r.eventId.toLowerCase()}`,
      ),
    );

    const seen = new Set<string>();

    const deduped = parsed.filter((c) => {
      const key = `${c.student.id.toLowerCase()}|${c.event.id.toLowerCase()}`;

      if (existingKeys.has(key) || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    const duplicateCount = parsed.length - deduped.length;

    if (deduped.length === 0) {
      toast.info("All rows in the file already have contribution records");
      return;
    }

    // Pause realtime-triggered reloads during the import.
    isImportingRef.current = true;

    toast.info(`Importing ${deduped.length} contribution(s)...`);

    try {
      // Bounded concurrency so a large spreadsheet doesn't fire
      // hundreds of Supabase requests at once.
      const CONCURRENCY = 5;
      let cursor = 0;
      let receiptQueue = Promise.resolve();

      const getNextReceiptNumber = async () => {
        const previous = receiptQueue;

        let resolveQueue!: () => void;

        receiptQueue = new Promise<void>((resolve) => {
          resolveQueue = resolve;
        });

        await previous;

        try {
          return await officialReceiptNumber();
        } finally {
          resolveQueue();
        }
      };
      const worker = async () => {
        while (cursor < deduped.length) {
          const item = deduped[cursor++];

          try {
            const contribution = await contributionsService.create({
              studentId: item.student.id,
              eventId: item.event.id,
              eventName: item.event.name,
              requiredAmount: item.requiredAmount,
              amountPaid: item.amountPaid,
              remainingBalance: Math.max(
                0,
                item.requiredAmount - item.amountPaid,
              ),
            });
            successfulImports++;
            // Only users allowed to issue receipts should generate
            // official receipts and payment records.
            //
            // The contribution itself has already stored Amount Paid,
            // so users without receipt permission do not lose the
            // historical payment amount.
            if (item.amountPaid > 0 && canIssueReceipts) {
              try {
                const orNumber = await getNextReceiptNumber();

                const receiptUrl = await autoCreateReceipt({
                  tag: "PAYMENT",
                  receiptNumber: orNumber,
                  issuedTo: item.student.name,
                  eventName: item.event.name,
                  description: `Payment for ${item.event.name} (imported)`,
                  amount: item.amountPaid,
                  type: "income",
                  date: today(),
                  recordedBy: staffName || "Council Officer",
                });

                await paymentsService.create({
                  studentId: item.student.id,
                  studentName: item.student.name,
                  eventId: item.event.id,
                  eventName: item.event.name,
                  contributionId: contribution.id,
                  amount: item.amountPaid,
                  date: today(),
                  recordedBy: staffName || "Council Officer",
                  receiptUrl,
                });

                receiptsIssued++;
              } catch (receiptError) {
                console.warn(
                  "Auto receipt generation failed for an imported row:",
                  receiptError,
                );

                receiptFailures++;
              }
            }
          } catch (error) {
            importFailures++;

            console.error("Error importing a contribution row:", error);
          }
        }
      };

      await Promise.all(
        Array.from(
          {
            length: Math.min(CONCURRENCY, deduped.length),
          },
          worker,
        ),
      );

      // Combine all reasons rows may have been skipped.
      const totalSkipped =
        unmatchedStudent + unmatchedEvent + invalidAmount + duplicateCount;

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

      if (receiptFailures > 0) {
        parts.push(`${receiptFailures} receipt(s) failed`);
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
              <Loader2 className="w-4 h-4 animate-spin" />
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
          onChange={(e) => setFilter("eventId", e.target.value)}
          className="glass-input px-4 py-2 text-sm"
          disabled={loading}
        >
          <option value="">All Events</option>
          {sortedEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="glass-input px-4 py-2 text-sm"
          disabled={loading}
        >
          <option value="">All Statuses</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial Payment">Partial Payment</option>
          <option value="Fully Paid">Fully Paid</option>
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

          {filteredRecords.length === 0 && (
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
          Total Records: <strong className="text-dark">{records.length}</strong>
        </span>
        <span>
          Filtered:{" "}
          <strong className="text-dark">{filteredRecords.length}</strong>
        </span>
      </div>

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        totalItems={filteredRecords.length}
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
                {sortedEvents.map((event) => (
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
                    <Loader2 className="w-4 h-4 animate-spin" />
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
                {sortedEvents.map((event) => (
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
                <DollarSign className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
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
                    <Loader2 className="w-4 h-4 animate-spin" />
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
