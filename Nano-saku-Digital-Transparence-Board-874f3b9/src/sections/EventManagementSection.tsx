import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  ArrowLeft, Calendar, Plus, CreditCard, Users, CheckCircle, XCircle,
  Upload, Save, DollarSign, FileText
} from 'lucide-react';
import { events as initialEvents, students, paymentRecords } from '@/data/store';
import type { Event } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EventManagementSectionProps {
  onBack: () => void;
  initialTab?: string;
}

export default function EventManagementSection({ onBack, initialTab = 'event-management' }: EventManagementSectionProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [events, setEvents] = useState<Event[]>(initialEvents);
  
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

  const handleAddEvent = () => {
    const newEvent: Event = {
      id: Date.now().toString(),
      name: eventForm.name,
      allocationAmount: eventForm.allocationAmount,
      date: eventForm.date,
    };
    setEvents([...events, newEvent]);
    setShowEventModal(false);
    setEventForm({ name: '', allocationAmount: 0, date: '' });
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Payment recorded successfully!');
    setPaymentForm({ studentId: '', eventId: '', amount: 0, receipt: null });
  };

  const handleMarkAttendance = (studentId: string, status: 'present' | 'absent') => {
    setAttendance({ ...attendance, [studentId]: status });
  };

  const handleBulkAttendance = (status: 'present' | 'absent') => {
    const newAttendance: Record<string, 'present' | 'absent'> = {};
    students.forEach(s => {
      newAttendance[s.id] = status;
    });
    setAttendance(newAttendance);
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

        {/* Tabs */}
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
                        placeholder="0"
                        className="glass-input w-full pl-10 pr-4 py-3 text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark mb-1.5">Upload Receipt</label>
                    <div className="border-2 border-dashed border-white/50 rounded-xl p-6 text-center hover:bg-white/20 transition-colors cursor-pointer">
                      <Upload className="w-8 h-8 text-text-secondary mx-auto mb-2" />
                      <p className="text-sm text-text-secondary">Click to upload receipt</p>
                      <p className="text-xs text-text-secondary mt-1">PNG, JPG up to 5MB</p>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" />
                    <span>Record Payment</span>
                  </button>
                </form>
              </div>

              {/* Recent Payments */}
              <div className="glass-card p-5 lg:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">Recent Payments</h3>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {paymentRecords.slice(0, 10).map((payment) => (
                    <div key={payment.id} className="glass-card p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-dark text-sm">{payment.studentName}</p>
                        <p className="text-xs text-text-secondary">{payment.eventName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600">₱{payment.amount.toLocaleString()}</p>
                        <p className="text-xs text-text-secondary">{formatDate(payment.date)}</p>
                      </div>
                    </div>
                  ))}
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
                  <h3 className="font-display font-semibold text-lg text-dark">Attendance Management</h3>
                </div>
                <select
                  value={selectedEventForAttendance}
                  onChange={(e) => setSelectedEventForAttendance(e.target.value)}
                  className="glass-input px-4 py-2.5 text-sm"
                >
                  <option value="">Select Event</option>
                  {events.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              {selectedEventForAttendance && (
                <>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => handleBulkAttendance('present')}
                      className="glass-button px-3 py-1.5 text-xs flex items-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Mark All Present
                    </button>
                    <button
                      onClick={() => handleBulkAttendance('absent')}
                      className="glass-button px-3 py-1.5 text-xs flex items-center gap-1"
                    >
                      <XCircle className="w-3 h-3" />
                      Mark All Absent
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="glass-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>ID</th>
                          <th>Program</th>
                          <th className="text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr key={student.id}>
                            <td className="font-medium text-dark">{student.name}</td>
                            <td className="text-text-secondary text-sm">{student.studentId}</td>
                            <td className="text-text-secondary text-sm">{student.program}</td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'present')}
                                  className={`p-2 rounded-lg transition-colors ${
                                    attendance[student.id] === 'present'
                                      ? 'bg-green-100 text-green-600'
                                      : 'hover:bg-white/50 text-text-secondary'
                                  }`}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'absent')}
                                  className={`p-2 rounded-lg transition-colors ${
                                    attendance[student.id] === 'absent'
                                      ? 'bg-red/10 text-red'
                                      : 'hover:bg-white/50 text-text-secondary'
                                  }`}
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button className="btn-primary px-6 py-2.5 flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      <span>Save Attendance</span>
                    </button>
                  </div>
                </>
              )}

              {!selectedEventForAttendance && (
                <div className="text-center py-12 text-text-secondary">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>Select an event to manage attendance</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Event Modal */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Create New Event</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddEvent(); }} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Event Name</label>
              <input
                type="text"
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                placeholder="e.g., Foundation Day"
                className="glass-input w-full px-4 py-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Allocation Amount (₱)</label>
              <input
                type="number"
                value={eventForm.allocationAmount || ''}
                onChange={(e) => setEventForm({ ...eventForm, allocationAmount: parseInt(e.target.value) || 0 })}
                placeholder="0"
                className="glass-input w-full px-4 py-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">Event Date</label>
              <input
                type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                className="glass-input w-full px-4 py-3 text-sm"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="btn-secondary flex-1 py-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Event</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
