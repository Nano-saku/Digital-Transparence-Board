import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ArrowLeft, User, Calendar, CheckCircle, XCircle, Wallet, Receipt, FileText } from 'lucide-react';
import type { Student } from '@/types';
import { getAttendanceByStudent, getContributionsByStudent, getPaymentsByStudent } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

  const attendanceRecords = getAttendanceByStudent(student.id);
  const contributionRecords = getContributionsByStudent(student.id);
  const paymentRecords = getPaymentsByStudent(student.id);

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

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-red relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-40 right-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-40 left-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-dark/80 hover:text-red transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Search</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 max-w-7xl mx-auto">
          {/* Profile Card */}
          <div 
            ref={profileRef}
            className="lg:col-span-3"
          >
            <div className="glass-card-strong p-5 lg:p-6 h-full">
              <div className="text-center">
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-4">
                  <User className="w-10 h-10 lg:w-12 lg:h-12 text-red" />
                </div>
                <h2 className="font-display font-semibold text-xl lg:text-2xl text-dark mb-1">
                  {student.name}
                </h2>
                <p className="text-text-secondary text-sm mb-4">
                  ID: {student.studentId}
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/50">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Program</span>
                  <span className="text-sm font-medium text-dark text-right">{student.program}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Year Level</span>
                  <span className="text-sm font-medium text-dark">{student.yearLevel}{getOrdinalSuffix(student.yearLevel)} Year</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Section</span>
                  <span className="text-sm font-medium text-dark">{student.section}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div 
            ref={attendanceRef}
            className="lg:col-span-5"
          >
            <div className="glass-card p-5 lg:p-6 h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Attendance</h3>
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
                    {attendanceRecords.length > 0 ? (
                      attendanceRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="font-medium text-dark text-sm">{record.eventName}</td>
                          <td className="text-text-secondary text-sm">{formatDate(record.date)}</td>
                          <td>
                            {record.status === 'present' ? (
                              <span className="badge-present flex items-center gap-1 w-fit">
                                <CheckCircle className="w-3 h-3" />
                                Present
                              </span>
                            ) : (
                              <span className="badge-absent flex items-center gap-1 w-fit">
                                <XCircle className="w-3 h-3" />
                                Absent
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="text-center text-text-secondary py-4">
                          No attendance records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Contributions Table */}
          <div 
            ref={contributionsRef}
            className="lg:col-span-4"
          >
            <div className="glass-card p-5 lg:p-6 h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Contributions</h3>
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
                    {contributionRecords.length > 0 ? (
                      contributionRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="font-medium text-dark text-sm">{record.eventName}</td>
                          <td className="text-text-secondary text-sm">₱{record.requiredAmount}</td>
                          <td className="text-green-600 text-sm font-medium">₱{record.amountPaid}</td>
                          <td>
                            {record.remainingBalance > 0 ? (
                              <span className="text-red text-sm font-medium">₱{record.remainingBalance}</span>
                            ) : (
                              <span className="badge-present text-xs">Paid</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="text-center text-text-secondary py-4">
                          No contribution records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Receipts Gallery */}
          <div 
            ref={receiptsRef}
            className="lg:col-span-12"
          >
            <div className="glass-card p-5 lg:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Receipts & Proofs</h3>
              </div>

              {paymentRecords.filter(p => p.receiptUrl).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {paymentRecords.filter(p => p.receiptUrl).map((payment) => (
                    <button
                      key={payment.id}
                      onClick={() => setSelectedReceipt(payment.receiptUrl || null)}
                      className="glass-card p-3 hover:scale-105 transition-transform text-left group"
                    >
                      <div className="aspect-square rounded-xl bg-red/5 flex items-center justify-center mb-3 group-hover:bg-red/10 transition-colors">
                        <FileText className="w-8 h-8 text-red/60" />
                      </div>
                      <p className="text-xs font-medium text-dark truncate">{payment.eventName}</p>
                      <p className="text-xs text-text-secondary">₱{payment.amount}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-text-secondary">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>No receipts uploaded yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Receipt Preview</DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-red/5 rounded-xl flex items-center justify-center">
            <div className="text-center text-text-secondary">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-40" />
              <p>Receipt image would be displayed here</p>
              <p className="text-sm mt-1">{selectedReceipt}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// Helper functions
function getOrdinalSuffix(num: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
