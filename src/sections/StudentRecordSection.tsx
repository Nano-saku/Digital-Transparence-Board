import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ArrowLeft, User, Calendar, CheckCircle, XCircle, Wallet, Receipt, FileText, Loader2 } from 'lucide-react';
import type { Student, AttendanceRecord, ContributionRecord, PaymentRecord } from '@/types';
import { attendanceService, contributionsService, paymentsService } from '@/services/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface StudentRecordSectionProps {
  student: Student;
  onBack: () => void;
}

export default function StudentRecordSection({ student, onBack }: StudentRecordSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const attendanceRef = useRef<HTMLDivElement>(null);
  const contributionsRef = useRef<HTMLDivElement>(null);
  const receiptsRef = useRef<HTMLDivElement>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Data states
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [contributionRecords, setContributionRecords] = useState<ContributionRecord[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);

  // Load data from database
  useEffect(() => {
    loadStudentData();
  }, [student.id]);

  const loadStudentData = async () => {
    try {
      setLoading(true);
      const [attendanceData, contributionsData, paymentsData] = await Promise.all([
        attendanceService.getByStudentId(student.id),
        contributionsService.getByStudentId(student.id),
        paymentsService.getByStudentId(student.id),
      ]);
      setAttendanceRecords(attendanceData);
      setContributionRecords(contributionsData);
      setPaymentRecords(paymentsData);
    } catch (error) {
      console.error('Error loading student data:', error);
      toast.error('Failed to load student records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      // Profile card entrance
      tl.fromTo(
        profileRef.current,
        { x: '-60vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.8 }
      );

      // Attendance table entrance
      tl.fromTo(
        attendanceRef.current,
        { y: '60vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7 },
        '-=0.5'
      );

      // Contributions table entrance
      tl.fromTo(
        contributionsRef.current,
        { x: '60vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7 },
        '-=0.5'
      );

      // Receipts gallery entrance
      tl.fromTo(
        receiptsRef.current,
        { y: '60vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7 },
        '-=0.4'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const totalPaid = contributionRecords.reduce((sum, c) => sum + c.amountPaid, 0);
  const totalRequired = contributionRecords.reduce((sum, c) => sum + c.requiredAmount, 0);
  const totalBalance = contributionRecords.reduce((sum, c) => sum + c.remainingBalance, 0);

  const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
  const absentCount = attendanceRecords.filter(r => r.status === 'absent').length;

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-40 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-40 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-white/50 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5 text-dark" />
            <span className="text-dark">Back to Search</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="glass-card p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-red" />
            <p className="text-text-secondary">Loading student records...</p>
          </div>
        )}

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
                <div className="flex flex-wrap gap-3">
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{presentCount}</p>
                    <p className="text-xs text-text-secondary">Present</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-red">{absentCount}</p>
                    <p className="text-xs text-text-secondary">Absent</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-dark">₱{totalPaid.toLocaleString()}</p>
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
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="font-medium text-dark">{record.eventName}</td>
                          <td className="text-text-secondary">{formatDate(record.date)}</td>
                          <td>
                            {record.status === 'present' ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                Present
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red">
                                <XCircle className="w-4 h-4" />
                                Absent
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {attendanceRecords.length === 0 && (
                  <div className="text-center py-8 text-text-secondary">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>No attendance records found</p>
                  </div>
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
                        <th>Required</th>
                        <th>Paid</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="font-medium text-dark">{record.eventName}</td>
                          <td className="text-text-secondary">₱{record.requiredAmount.toLocaleString()}</td>
                          <td className="text-green-600">₱{record.amountPaid.toLocaleString()}</td>
                          <td className={`font-medium ${record.remainingBalance > 0 ? 'text-red' : 'text-green-600'}`}>
                            ₱{record.remainingBalance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {contributionRecords.length === 0 && (
                  <div className="text-center py-8 text-text-secondary">
                    <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>No contribution records found</p>
                  </div>
                )}

                {/* Summary */}
                {contributionRecords.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/20">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">Total Required:</span>
                      <span className="font-medium text-dark">₱{totalRequired.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-text-secondary">Total Paid:</span>
                      <span className="font-medium text-green-600">₱{totalPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-text-secondary">Remaining Balance:</span>
                      <span className={`font-medium ${totalBalance > 0 ? 'text-red' : 'text-green-600'}`}>
                        ₱{totalBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Receipts */}
            <div ref={receiptsRef} className="glass-card p-5 lg:p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Payment Receipts</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {paymentRecords.filter(p => p.receiptUrl).map((payment) => (
                  <button
                    key={payment.id}
                    onClick={() => setSelectedReceipt(payment.receiptUrl || null)}
                    className="glass-card p-3 text-left hover:scale-105 transition-transform"
                  >
                    <div className="aspect-square rounded-lg bg-red/5 flex items-center justify-center mb-2">
                      <Receipt className="w-8 h-8 text-red/40" />
                    </div>
                    <p className="text-xs font-medium text-dark truncate">{payment.eventName}</p>
                    <p className="text-xs text-green-600">₱{payment.amount.toLocaleString()}</p>
                    <p className="text-xs text-text-secondary">{formatDate(payment.date)}</p>
                  </button>
                ))}
              </div>

              {paymentRecords.filter(p => p.receiptUrl).length === 0 && (
                <div className="text-center py-8 text-text-secondary">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No receipts available</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Receipt Modal */}
      <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Payment Receipt
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {selectedReceipt ? (
              <img 
                src={selectedReceipt} 
                alt="Receipt" 
                className="w-full rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/receipts/placeholder.jpg';
                }}
              />
            ) : (
              <div className="text-center py-12 text-text-secondary">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Receipt not available</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function getOrdinalSuffix(num: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
}
