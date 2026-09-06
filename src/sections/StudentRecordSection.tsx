import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, Calendar, CheckCircle, XCircle, Wallet, Receipt, FileText, Download, Loader2, QrCode, ChevronDown, Clock, ExternalLink, FolderOpen, Eye } from 'lucide-react';
import type { Student, AttendanceRecord, ContributionRecord, PaymentRecord, StudentRequirementFile } from '@/types';
import { attendanceService, contributionsService, paymentsService, studentRequirementFilesService } from '@/services/db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { downloadContributionReceipt, officialReceiptNumber, type ReceiptFormat } from '@/lib/receipts';
import ReceiptViewer from '@/components/ReceiptViewer';
import StudentQrModal from '@/components/StudentQrModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { formatDate, formatPeso, getOrdinalSuffix, formatTimeRange, today } from '@/lib/format';
import { contributionStatus } from '@/lib/contributions';
import { useSectionEntrance } from '@/hooks/useSectionEntrance';
import SectionLoader from '@/components/SectionLoader';
import SectionEmptyState from '@/components/SectionEmptyState';
import SectionBackButton from '@/components/SectionBackButton';
import AnimatedNetwork from '@/components/ui/animated-network';

interface StudentRecordSectionProps {
  student: Student;
  onBack: () => void;
}

/** Formats a byte count into a human-readable file size (e.g. "1.4 MB"). */
function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function StudentRecordSection({ student, onBack }: StudentRecordSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const attendanceRef = useRef<HTMLDivElement>(null);
  const contributionsRef = useRef<HTMLDivElement>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [qrStudent, setQrStudent] = useState<Student | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Data states
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [contributionRecords, setContributionRecords] = useState<ContributionRecord[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);

  // Published Student Requirement Files (Student Viewer)
  const [publishedFiles, setPublishedFiles] = useState<StudentRequirementFile[]>([]);
  const [previewFile, setPreviewFile] = useState<StudentRequirementFile | null>(null);

  // Load data from database
  const loadStudentData = useCallback(async () => {
    try {
      setLoading(true);
      const [attendanceData, contributionsData, paymentsData, publishedData] =
        await Promise.all([
          attendanceService.getByStudentId(student.id),
          contributionsService.getByStudentId(student.id),
          paymentsService.getByStudentId(student.id),
          studentRequirementFilesService.getPublished(),
        ]);
      setAttendanceRecords(attendanceData);
      setContributionRecords(contributionsData);
      setPaymentRecords(paymentsData);
      // Published requirement files shown to the student (Student Viewer).
      setPublishedFiles(publishedData);
    } catch (error) {
      console.error('Error loading student data:', error);
      toast.error('Failed to load student records');
    } finally {
      setLoading(false);
    }
  }, [student.id]);

  useEffect(() => {
    loadStudentData();
  }, [loadStudentData]);

  // Payment receipts are grouped by event once (memoized) instead of being
  // re-filtered for every row on every render.
  const receiptsByEvent = useMemo(() => {
    const map = new Map<string, PaymentRecord[]>();
    for (const payment of paymentRecords) {
      if (!payment.receiptUrl) continue;
      const list = map.get(payment.eventId);
      if (list) list.push(payment);
      else map.set(payment.eventId, [payment]);
    }
    return map;
  }, [paymentRecords]);

  const receiptsForEvent = (eventId: string): PaymentRecord[] =>
    receiptsByEvent.get(eventId) ?? [];

  // Builds the contribution-record receipt (student, event, required, paid,
  // balance, status) and downloads it directly — no storage round-trip.
  // Supports SVG, PNG, and JPG formats.
  const handleDownloadContributionReceipt = async (
    record: ContributionRecord,
    format: ReceiptFormat = 'svg'
  ) => {
    try {
      setDownloadingId(record.id);
      // Client-side guard (mirrors the backend guard in downloadContributionReceipt):
      // an Official Receipt may only be issued once the payment is fully paid.
      if (contributionStatus(record).label !== 'Fully Paid') {
        throw new Error(
          'Official Receipt is only available once the payment is fully paid.'
        );
      }
      const message = await downloadContributionReceipt({
        tag: 'CONTRIBUTION RECORD',
        receiptNumber: await officialReceiptNumber(),
        issuedTo: student.name,
        eventName: record.eventName,
        amount: record.amountPaid,
        type: 'income',
        date: today(),
        recordedBy: 'Council Officer',
        requiredAmount: record.requiredAmount,
        remainingBalance: record.remainingBalance,
        statusLabel: contributionStatus(record).label,
      }, format);
      toast.success(message);
    } catch (error) {
      console.error('Error downloading contribution receipt:', error);
      toast.error('Failed to download receipt. Please try again.');
    } finally {
      setDownloadingId((current) => (current === record.id ? null : current));
    }
  };

  useSectionEntrance(sectionRef, [
      // Profile card entrance
      { ref: profileRef, from: { x: '-60vw', opacity: 0 }, to: { x: 0, opacity: 1, duration: 0.8 } },
      // Attendance table entrance
      { ref: attendanceRef, from: { y: '60vh', opacity: 0 }, to: { y: 0, opacity: 1, duration: 0.7 }, position: '-=0.5' },
      // Contributions table entrance
      { ref: contributionsRef, from: { x: '60vw', opacity: 0 }, to: { x: 0, opacity: 1, duration: 0.7 }, position: '-=0.5' },
    ]);

  // Summary figures share a single pass over the records so the per-render
  // cost stays O(n), not O(3n).
  const { totalPaid, totalRequired, totalBalance } = useMemo(() => {
    let paid = 0;
    let required = 0;
    let balance = 0;
    for (const record of contributionRecords) {
      paid += record.amountPaid;
      required += record.requiredAmount;
      balance += record.remainingBalance;
    }
    return { totalPaid: paid, totalRequired: required, totalBalance: balance };
  }, [contributionRecords]);

  const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
  const lateCount = attendanceRecords.filter(r => r.status === 'late').length;
  const absentCount = attendanceRecords.filter(r => r.status === 'absent').length;

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Animated Network Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <AnimatedNetwork nodeCount={45} maxEdgeDistance={150} speed={0.3} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Back Button */}
        <div className="mb-6">
          <SectionBackButton onClick={onBack} label="Back to Search" />
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading student records..." />}

        {!loading && (
          <>
            {/* Profile Card */}
            <div ref={profileRef} className="glass-card-strong p-6 lg:p-8 mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-red/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-12 h-12 text-red" />
                </div>
                <div className="flex-1">
                  <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark mb-2">
                    {student.name}
                  </h1>
                  <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {student.studentId}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {student.program}
                    </span>
                    <span>{student.yearLevel}{getOrdinalSuffix(student.yearLevel)} Year - Section {student.section}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
onClick={() => setQrStudent(student)}
                    className="glass-button px-4 py-2.5 flex items-center gap-2 text-sm"
                    title="Download your attendance QR code (Student ID, Name, Program, Year, Section)"
                  >
                    <QrCode className="w-4 h-4" />
                    QR Code
                  </button>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{presentCount}</p>
                    <p className="text-xs text-text-secondary">Present</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-amber-500">{lateCount}</p>
                    <p className="text-xs text-text-secondary">Late</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-red-500">{absentCount}</p>
                    <p className="text-xs text-text-secondary">Absent</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-dark">{formatPeso(totalPaid)}</p>
                    <p className="text-xs text-text-secondary">Total Paid</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Attendance Records */}
              <div ref={attendanceRef} className="glass-card p-5 lg:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">Attendance Records</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="font-medium text-dark">{record.eventName}</td>
                          <td className="text-text-secondary">{formatDate(record.date)}</td>
                          <td>
                            {record.status === 'present' && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                Present
                              </span>
                            )}
                            {record.status === 'late' && (
                              <span className="flex items-center gap-1 text-amber-500">
                                <Clock className="w-4 h-4" />
                                Late
                              </span>
                            )}
                            {record.status === 'absent' && (
                              <span className="flex items-center gap-1 text-red-500">
                                <XCircle className="w-4 h-4" />
                                Absent
                              </span>
                            )}
                          </td>
                          <td className="text-text-secondary whitespace-nowrap">
                            {record.status !== 'absent' && (record.timeIn || record.timeOut)
                              ? formatTimeRange(record.timeIn, record.timeOut)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {attendanceRecords.length === 0 && (
                  <SectionEmptyState message="No attendance records found" icon={Calendar} compact />
                )}
              </div>

              {/* Contribution Records */}
              <div ref={contributionsRef} className="glass-card p-5 lg:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">Contribution Records</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Downloadable Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionRecords.map((record) => {
                        const status = contributionStatus(record);
                        const paymentReceipts = receiptsForEvent(record.eventId);
                        return (
                          <tr key={record.id}>
                            <td className="font-medium text-dark">{record.eventName}</td>
                            <td>
                              <span className="font-medium text-green-600">{formatPeso(record.amountPaid)}</span>
                              <span className="block text-xs text-text-secondary">
                                of {formatPeso(record.requiredAmount)}
                              </span>
                            </td>
                            <td className={`font-medium ${status.className}`}>
                              {status.label}
                            </td>
                            <td>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {/* Downloadable receipt: available ONLY when the payment is
                                    Fully Paid. Partial and Unpaid records never show a Download
                                    Receipt option and cannot produce an Official Receipt. */}
                                {status.label === 'Fully Paid' && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      asChild
                                      disabled={downloadingId === record.id}
                                      title={`Download contribution receipt – ${record.eventName}`}
                                    >
                                      <button
                                        disabled={downloadingId === record.id}
                                        className="px-2.5 py-1.5 text-xs disabled:opacity-70"
                                      >
                                        {downloadingId === record.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Download className="w-3.5 h-3.5" />
                                        )}
                                        Download
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="glass-card-strong">
                                      {(['svg', 'png', 'jpg'] as ReceiptFormat[]).map((format) => (
                                        <DropdownMenuItem
                                          key={format}
                                          onClick={() => handleDownloadContributionReceipt(record, format)}
                                          className="flex items-center gap-2 cursor-pointer text-xs"
                                        >
                                          {format.toUpperCase()}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                {status.label === 'Fully Paid' && paymentReceipts.map((payment) => (
                                  <button
                                    key={payment.id}
                                    type="button"
                                    onClick={() => setSelectedReceipt(payment.receiptUrl || null)}
                                    className="p-2 rounded-lg text-text-secondary"
                                    title={`Preview payment receipt – ${payment.eventName} (${formatDate(payment.date)})`}
                                    aria-label="Preview payment receipt"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {contributionRecords.length === 0 && (
                  <SectionEmptyState message="No contribution records found" icon={Wallet} compact />
                )}

                {/* Summary */}
                {contributionRecords.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/50">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">Total Required:</span>
                      <span className="font-medium text-dark">{formatPeso(totalRequired)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-text-secondary">Total Paid:</span>
                      <span className="font-medium text-green-600">{formatPeso(totalPaid)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-text-secondary">Remaining Balance:</span>
                      <span className={`font-medium ${totalBalance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {formatPeso(totalBalance)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Student Requirement Files (published files visible to students) */}
            <div id="requirement-files" className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Student Requirement Files</h3>
              </div>

              {publishedFiles.length === 0 ? (
                <SectionEmptyState
                  message="No requirement files have been published yet"
                  icon={FolderOpen}
                  compact
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {publishedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-xl border border-white/50 bg-white/40 p-4 flex flex-col"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-red" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-dark text-sm leading-snug">
                            {file.title}
                          </p>
                          {file.description && (
                            <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                              {file.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
                        <span className="truncate">{file.fileName}</span>
                        <span className="flex-shrink-0">{formatFileSize(file.fileSize)}</span>
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        Published {formatDate(file.updatedAt)}
                      </p>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs glass-button"
                          title={`Preview ${file.title}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Preview
                        </button>
                        <a
                          href={file.fileUrl}
                          download={file.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs glass-button"
                          title={`Download ${file.fileName}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            </>
        )}
      </div>

      {/* Receipt Modal */}
      <ReceiptViewer
        receiptUrl={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        title="Contribution Receipt"
      />

      {/* Attendance QR Code Modal */}
      <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />

      {/* Requirement File Preview Modal */}
      <Dialog
        open={!!previewFile}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="glass-card-strong max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {previewFile?.title}
            </DialogTitle>
          </DialogHeader>

          {previewFile && (
            <div className="mt-4">
              {previewFile.description && (
                <p className="mb-4 text-sm text-text-secondary">{previewFile.description}</p>
              )}

              <div className="max-h-[55vh] overflow-auto rounded-lg bg-white/30">
                {previewFile.fileType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(previewFile.fileName) ? (
                  <img
                    src={previewFile.fileUrl}
                    alt={previewFile.title}
                    className="w-full rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/file-placeholder.svg';
                    }}
                  />
                ) : (
                  <iframe
                    src={previewFile.fileUrl}
                    title={previewFile.title}
                    className="w-full h-[55vh] rounded-lg"
                  />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-text-secondary">
                  {previewFile.fileName} · {formatFileSize(previewFile.fileSize)}
                </span>
                <div className="flex gap-3">
                  <a
                    href={previewFile.fileUrl}
                    download={previewFile.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm glass-button"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                  <button
                    onClick={() => window.open(previewFile.fileUrl, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm glass-button"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in new tab
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
