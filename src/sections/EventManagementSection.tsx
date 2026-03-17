import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  ArrowLeft, Calendar, Plus, CreditCard, Users, CheckCircle, XCircle,
  Upload, Save, DollarSign, FileText, Loader2
} from 'lucide-react';
import { eventsService, studentsService, paymentsService, attendanceService, contributionsService } from '@/services/db';
import type { Event, Student, PaymentRecord, AttendanceRecord } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface EventManagementSectionProps {
  onBack: () => void;
  initialTab?: string;
}

export default function EventManagementSection({ onBack, initialTab = 'event-management' }: EventManagementSectionProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Event form
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ name: '', allocationAmount: 0, date: '' });

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    eventId: '',
    amount: 0,
    receipt: null as File | null,
  });

  // Attendance
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState('');
  const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent'>>({});

  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load data from database
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [eventsData, studentsData, paymentsData, attendanceData] = await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        paymentsService.getAll(),
        attendanceService.getAll(),
      ]);
      setEvents(eventsData);
      setStudents(studentsData);
      setPayments(paymentsData);
      setAttendanceRecords(attendanceData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentRef.current,
        { y: '6vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleAddEvent = async () => {
    try {
      setSaving(true);
      const newEvent = await eventsService.create({
        name: eventForm.name,
        allocationAmount: eventForm.allocationAmount,
        date: eventForm.date,
      });
      setEvents([...events, newEvent]);
      setShowEventModal(false);
      setEventForm({ name: '', allocationAmount: 0, date: '' });
      toast.success('Event created successfully');
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const student = students.find(s => s.id === paymentForm.studentId);
      const event = events.find(e => e.id === paymentForm.eventId);

      if (!student || !event) {
        toast.error('Please select both student and event');
        return;
      }

      await paymentsService.create({
        studentId: paymentForm.studentId,
        studentName: student.name,
        eventId: paymentForm.eventId,
        eventName: event.name,
        amount: paymentForm.amount,
        date: new Date().toISOString().split('T')[0],
        recordedBy: 'Admin User',
      });

      // Update contribution record
      const contributions = await contributionsService.getByStudentId(student.id);
      const contribution = contributions.find(c => c.eventId === event.id);
      if (contribution) {
        await contributionsService.update(contribution.id, {
          amountPaid: contribution.amountPaid + paymentForm.amount,
          remainingBalance: Math.max(0, contribution.remainingBalance - paymentForm.amount),
        });
      }

      toast.success('Payment recorded successfully!');
      setPaymentForm({ studentId: '', eventId: '', amount: 0, receipt: null });

      // Refresh payments
      const updatedPayments = await paymentsService.getAll();
      setPayments(updatedPayments);
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAttendance = async (studentId: string, status: 'present' | 'absent') => {
    setAttendance({ ...attendance, [studentId]: status });
  };

  const handleBulkAttendance = (status: 'present' | 'absent') => {
    const newAttendance: Record<string, 'present' | 'absent'> = {};
    students.forEach(s => {
      newAttendance[s.id] = status;
    });
    setAttendance(newAttendance);
  };

  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      const event = events.find(e => e.id === selectedEventForAttendance);
      if (!event) {
        toast.error('Please select an event');
        return;
      }

      const attendancePromises = Object.entries(attendance).map(([studentId, status]) => {
        const student = students.find(s => s.id === studentId);
        if (!student) return Promise.resolve();

        return attendanceService.create({
          studentId,
          eventId: selectedEventForAttendance,
          eventName: event.name,
          date: new Date().toISOString().split('T')[0],
          status,
        });
      });

      await Promise.all(attendancePromises);
      toast.success('Attendance saved successfully!');

      // Refresh attendance records
      const updatedAttendance = await attendanceService.getAll();
      setAttendanceRecords(updatedAttendance);
      setAttendance({});
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const expectedCollection = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return 0;
    return event.allocationAmount * students.length;
  };

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-warm relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-40 right-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-40 left-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div ref={contentRef} className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-white/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-dark" />
            </button>
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                Event & Payment Management
              </h1>
              <p className="text-text-secondary text-sm">
                Manage events, record payments, and track attendance
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="glass-card p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-red" />
            <p className="text-text-secondary">Loading data...</p>
          </div>
        )}

        {/* Tabs */}
        {!loading && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="glass-card mb-6 p-1 flex flex-wrap gap-1">
              <TabsTrigger value="event-management" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
                <Calendar className="w-4 h-4 mr-2" />
                Events
              </TabsTrigger>
              <TabsTrigger value="payment-management" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
                <CreditCard className="w-4 h-4 mr-2" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="attendance-management" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
                <Users className="w-4 h-4 mr-2" />
                Attendance
              </TabsTrigger>
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="event-management">
              <div className="glass-card p-5 lg:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">Events & Allocations</h3>
                  </div>
                  <button 
                    onClick={() => setShowEventModal(true)}
                    className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Event</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Event Name</th>
                        <th>Date</th>
                        <th>Allocation</th>
                        <th>Expected Collection</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td className="font-medium text-dark">{event.name}</td>
                          <td className="text-text-secondary">{event.date ? formatDate(event.date) : '-'}</td>
                          <td className="text-text-secondary">₱{event.allocationAmount.toLocaleString()}</td>
                          <td className="font-medium text-green-600">₱{expectedCollection(event.id).toLocaleString()}</td>
                          <td>
                            <button className="text-red text-sm font-medium hover:underline">
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {events.length === 0 && (
                  <div className="text-center py-12 text-text-secondary">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>No events found</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payment-management">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Form */}
                <div className="glass-card p-5 lg:p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">Record Payment</h3>
                  </div>

                  <form onSubmit={handleRecordPayment} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">Select Student</label>
                      <select
                        value={paymentForm.studentId}
                        onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
                        className="glass-input w-full px-4 py-3 text-sm"
                        required
                      >
                        <option value="">Choose a student</option>
                        {students.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">Select Event</label>
                      <select
                        value={paymentForm.eventId}
                        onChange={(e) => setPaymentForm({ ...paymentForm, eventId: e.target.value })}
                        className="glass-input w-full px-4 py-3 text-sm"
                        required
                      >
                        <option value="">Choose an event</option>
                        {events.map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">Amount</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                        <input
                          type="number"
                          value={paymentForm.amount || ''}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseInt(e.target.value) || 0 })}
                          className="glass-input w-full pl-10 pr-4 py-3 text-sm"
                          placeholder="0.00"
                          required
                          min="1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">Receipt (Optional)</label>
                      <div className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center hover:border-red/50 transition-colors cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-text-secondary" />
                        <p className="text-sm text-text-secondary">Click to upload receipt</p>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full btn-primary px-4 py-3 flex items-center justify-center gap-2"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Record Payment
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Recent Payments */}
                <div className="glass-card p-5 lg:p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">Recent Payments</h3>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {payments.slice(0, 10).map((payment) => (
                      <div key={payment.id} className="glass-card p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-dark">{payment.studentName}</p>
                            <p className="text-sm text-text-secondary">{payment.eventName}</p>
                            <p className="text-xs text-text-secondary/70">{formatDate(payment.date)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">₱{payment.amount.toLocaleString()}</p>
                            <p className="text-xs text-text-secondary">{payment.recordedBy}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {payments.length === 0 && (
                      <div className="text-center py-8 text-text-secondary">
                        <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p>No payments recorded yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Attendance Tab */}
            <TabsContent value="attendance-management">
              <div className="glass-card p-5 lg:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">Attendance Tracking</h3>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBulkAttendance('present')}
                      className="glass-button px-3 py-2 text-sm flex items-center gap-1"
                    >
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Mark All Present
                    </button>
                    <button
                      onClick={() => handleBulkAttendance('absent')}
                      className="glass-button px-3 py-2 text-sm flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4 text-red" />
                      Mark All Absent
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-dark mb-1.5">Select Event</label>
                  <select
                    value={selectedEventForAttendance}
                    onChange={(e) => setSelectedEventForAttendance(e.target.value)}
                    className="glass-input w-full px-4 py-3 text-sm"
                  >
                    <option value="">Choose an event</option>
                    {events.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>

                {selectedEventForAttendance && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="glass-table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Student ID</th>
                            <th className="text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((student) => (
                            <tr key={student.id}>
                              <td className="font-medium text-dark">{student.name}</td>
                              <td className="text-text-secondary">{student.studentId}</td>
                              <td className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleMarkAttendance(student.id, 'present')}
                                    className={`p-2 rounded-lg transition-colors ${
                                      attendance[student.id] === 'present'
                                        ? 'bg-green-100 text-green-600'
                                        : 'hover:bg-white/50 text-text-secondary'
                                    }`}
                                  >
                                    <CheckCircle className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={() => handleMarkAttendance(student.id, 'absent')}
                                    className={`p-2 rounded-lg transition-colors ${
                                      attendance[student.id] === 'absent'
                                        ? 'bg-red/10 text-red'
                                        : 'hover:bg-white/50 text-text-secondary'
                                    }`}
                                  >
                                    <XCircle className="w-5 h-5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleSaveAttendance}
                        className="btn-primary px-6 py-2.5 flex items-center gap-2"
                        disabled={saving || Object.keys(attendance).length === 0}
                      >
                        {saving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save Attendance
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {!selectedEventForAttendance && (
                  <div className="text-center py-12 text-text-secondary">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>Select an event to track attendance</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Add Event Modal */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Create New Event
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Event Name</label>
              <input
                type="text"
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., General Assembly"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Date</label>
              <input
                type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                className="glass-input w-full px-4 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Allocation Amount (₱)</label>
              <input
                type="number"
                value={eventForm.allocationAmount || ''}
                onChange={(e) => setEventForm({ ...eventForm, allocationAmount: parseInt(e.target.value) || 0 })}
                className="glass-input w-full px-4 py-2"
                placeholder="0.00"
                min="0"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setShowEventModal(false)}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleAddEvent}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={saving || !eventForm.name || !eventForm.date}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Event
                  </>
                )}
              </button>
            </div>
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
