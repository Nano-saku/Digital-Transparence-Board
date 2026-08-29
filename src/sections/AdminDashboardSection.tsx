import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Users, Wallet, TrendingUp, TrendingDown, PieChart,
  UserCog, Calendar, CreditCard, FileText, LogOut,
  ArrowRight, MessageSquare, Coins
} from 'lucide-react';
import { today, daysUntil, formatPeso } from '@/lib/format';
import { useSectionEntrance } from '@/hooks/useSectionEntrance';
import SectionLoader from '@/components/SectionLoader';
import type { ViewState, FinancialSummary, Event, UserRole } from '@/types';
import { financialReportingService, studentsService, eventsService, feedbackService, boardMembersService, subscribeToTables } from '@/services/db';
import { toast } from 'sonner';
interface AdminDashboardSectionProps {
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  role: UserRole;
  userEmail: string;
  userId?: string;
}

export default function AdminDashboardSection({ onNavigate, onLogout, role, userEmail, userId = '' }: AdminDashboardSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryData, studentsData, eventsData, pendingFeedbackData, boardMembersData] = await Promise.all([
        financialReportingService.getReport().then((report) => report.summary),
        studentsService.getAll(),
        eventsService.getAll(),
        feedbackService.getByStatus('pending'),
        boardMembersService.listBoardMembers(),
      ]);
      setFinancialSummary(summaryData);
      setStudentCount(studentsData.length);
      setPendingFeedbackCount(pendingFeedbackData.length);

      // Upcoming = events whose date is today or later, soonest first.
      // Board members only see the events assigned to them.
      const todays = today();
      const assignedCatalogIds = new Set(
        boardMembersData
          .filter((member) => member.accountUserId === userId)
          .map((member) => member.id)
      );
      const upcoming = eventsData
        .filter((e) => e.date && e.date >= todays)
        .filter(
          (e) =>
            role !== 'board-member' ||
            (e.assignedMembers?.some((m) => assignedCatalogIds.has(m.memberId)) ?? false)
        )
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setUpcomingEvents(upcoming);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [role, userId]);

  // Load data from database and refresh the member-to-account mapping when the
  // authenticated user or role changes.
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Re-query every source table on change so dashboard figures never depend on
  // stale local values or hardcoded counters.
  useEffect(() => {
    return subscribeToTables(
      ['students', 'events', 'contributions', 'payments', 'transactions', 'feedback', 'board_members'],
      loadDashboardData,
      'dashboard',
    );
  }, [loadDashboardData]);

  useSectionEntrance(sectionRef, [
    // Headline entrance
    { ref: headlineRef, from: { x: '-30vw', opacity: 0 }, to: { x: 0, opacity: 1, duration: 0.7 } },
    // Summary cards entrance
    { ref: summaryRef, selector: '.summary-card', from: { y: '-20vh', opacity: 0 }, to: { y: 0, opacity: 1, duration: 0.6, stagger: 0.05 }, position: '-=0.4' },
    // Quick actions entrance
    { ref: actionsRef, selector: '.action-card', from: { y: '30vh', opacity: 0 }, to: { y: 0, opacity: 1, duration: 0.6, stagger: 0.06 }, position: '-=0.3' },
  ]);

  const summaryCards = [
    { 
      label: 'Total Students', 
      value: studentCount.toString(), 
      icon: Users, 
      color: 'blue',
      suffix: ''
    },
    { 
      label: 'Expected Contributions', 
      value: formatPeso(financialSummary?.totalExpectedContributions ?? 0), 
      icon: Wallet, 
      color: 'purple',
      suffix: ''
    },
    { 
      label: 'Funds Collected', 
      value: formatPeso(financialSummary?.totalFundsCollected ?? 0), 
      icon: TrendingUp, 
      color: 'green',
      suffix: ''
    },
    { 
      label: 'Funds Spent', 
      value: formatPeso(financialSummary?.totalFundsSpent ?? 0), 
      icon: TrendingDown, 
      color: 'red',
      suffix: ''
    },
    { 
      label: 'Remaining Budget', 
      value: formatPeso(financialSummary?.remainingBudget ?? 0), 
      icon: PieChart, 
      color: 'yellow',
      suffix: ''
    },
  ];

  const quickActions = [
    ...(role === 'admin'
      ? [{
          title: 'Student Management',
          description: 'Add, edit, or remove student records',
          icon: UserCog,
          view: 'student-management' as ViewState,
          color: 'blue',
        }]
      : []),
    ...(role === 'admin' || role === 'treasurer'
      ? [{
          title: 'Event Management',
          description: 'Create events and manage allocations',
          icon: Calendar,
          view: 'event-management' as ViewState,
          color: 'green',
        }]
      : []),
    ...(role === 'board-member'
      ? [{
          title: 'Assigned Events',
          description: 'View the events you are assigned to',
          icon: Calendar,
          view: 'event-management' as ViewState,
          color: 'green',
        }]
      : []),
    ...(role === 'admin' || role === 'secretary'
      ? [{
          title: 'Attendance Tracking',
          description: 'Record attendance for every event',
          icon: Users,
          view: 'attendance-management' as ViewState,
          color: 'green',
        }]
      : []),
    ...(role === 'admin' || role === 'treasurer' || role === 'auditor'
      ? [
          {
            title: 'Payment Records',
            description: 'Record and track student payments',
            icon: CreditCard,
            view: 'payment-management' as ViewState,
            color: 'purple',
          },
          {
            title: 'Transaction Ledger',
            description: 'Manage income and expenses with auto receipts',
            icon: FileText,
            view: 'transaction-management' as ViewState,
            color: 'yellow',
          },
          {
            title: 'Contribution Records',
            description: 'Add, edit, or remove student contributions',
            icon: Coins,
            view: 'contribution-management' as ViewState,
            color: 'blue',
          },
        ]
      : []),
    ...(role === 'board-member'
      ? [{
          title: 'Transparency Board',
          description: 'View the council financial report',
          icon: FileText,
          view: 'transparency' as ViewState,
          color: 'blue',
        }]
      : []),
    {
      title: 'Feedback Inbox',
      description: 'View all complaints, inquiries, and suggestions',
      icon: MessageSquare,
      view: 'feedback-management' as ViewState,
      color: 'purple',
    },
  ];

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Header */}
        <div ref={headlineRef} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="font-display font-bold text-3xl lg:text-4xl text-dark mb-2">
              Admin Dashboard
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <img
                src="/DSSC_logo.png"
                alt="DSSC logo"
                className="h-12 w-12 rounded-full border-2 border-lsc-gold/60 bg-white object-contain p-1"
              />
              <p className="text-text-secondary">
                {userEmail} — your council{' '}
                {
                  {
                    admin: 'operations',
                    secretary: 'attendance',
                    treasurer: 'finance',
                    auditor: 'finance & audit',
                    'board-member': 'events',
                  }[role]
                }{' '}
                overview.
              </p>
            </div>
          </div>
          <button
onClick={onLogout}
            className="glass-button px-4 py-2.5 flex items-center gap-2 self-start"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading dashboard data..." />}

        {!loading && (
          <>
            {/* Summary Cards */}
            <div ref={summaryRef} className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
              {summaryCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <div key={index} className="summary-card glass-card p-4 lg:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        card.color === 'blue' ? 'bg-blue-100' :
                        card.color === 'green' ? 'bg-green-100' :
                        card.color === 'red' ? 'bg-red/10' :
                        card.color === 'purple' ? 'bg-purple-100' :
                        'bg-yellow-100'
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          card.color === 'blue' ? 'text-blue-600' :
                          card.color === 'green' ? 'text-green-600' :
                          card.color === 'red' ? 'text-red' :
                          card.color === 'purple' ? 'text-purple-600' :
                          'text-yellow-600'
                        }`} />
                      </div>
                    </div>
                    <p className="font-display font-bold text-xl lg:text-2xl text-dark">
                      {card.value}{card.suffix}
                    </p>
                    <p className="text-xs text-text-secondary mt-1">{card.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              <div className="glass-card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-display font-bold text-2xl text-dark">{upcomingEvents.length}</p>
                  <p className="text-sm text-text-secondary">Upcoming Events</p>
                </div>
              </div>

              <div className="glass-card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-display font-bold text-2xl text-dark">{studentCount}</p>
                  <p className="text-sm text-text-secondary">Registered Students</p>
                </div>
              </div>

              <div className="glass-card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="font-display font-bold text-2xl text-dark">{pendingFeedbackCount}</p>
                  <p className="text-sm text-text-secondary">Pending Feedback</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="font-display font-semibold text-xl text-dark mb-4">
                Quick Actions
              </h2>
              <div ref={actionsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <button
key={index}
                      onClick={() => onNavigate(action.view)}
                      className="action-card glass-card p-5 text-left hover:shadow-lg transition-all group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
                        action.color === 'blue' ? 'bg-blue-100' :
                        action.color === 'green' ? 'bg-green-100' :
                        action.color === 'purple' ? 'bg-purple-100' :
                        'bg-yellow-100'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          action.color === 'blue' ? 'text-blue-600' :
                          action.color === 'green' ? 'text-green-600' :
                          action.color === 'purple' ? 'text-purple-600' :
                          'text-yellow-600'
                        }`} />
                      </div>
                      <h3 className="font-display font-semibold text-dark mb-1">
                        {action.title}
                      </h3>
                      <p className="text-sm text-text-secondary mb-3">
                        {action.description}
                      </p>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-royal-blue group-hover:gap-2 transition-all">
                        Manage
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="mt-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="font-display font-semibold text-xl text-dark">
                  Upcoming Events
                </h2>
                {(role === 'admin' || role === 'treasurer') && (
                  <button
onClick={() => onNavigate('event-management')}
                    className="text-sm self-start"
                  >
                    Manage all events
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="glass-card p-10 text-center text-text-secondary">
                  <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>{role === 'board-member' ? 'No events have been assigned to you yet' : 'No upcoming events scheduled'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {upcomingEvents.slice(0, 6).map((event) => {
                    const days = daysUntil(event.date || '');
                    return (
                      <div key={event.id} className="glass-card p-5">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-display font-semibold text-dark leading-snug">
                            {event.name}
                          </h3>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                            days === 0
                              ? 'bg-red-500 text-white'
                              : days > 0
                                ? 'bg-green-100 text-green-600'
                                : 'bg-red/10 text-red-500'
                          }`}>
                            {days === 0
                              ? 'Today'
                              : days > 0
                                ? `In ${days} day${days === 1 ? '' : 's'}`
                                : 'Over'}
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary mb-3">
                          {event.date
                            ? new Date(event.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Date not set'}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Allocation: <span className="font-medium text-dark">₱{event.allocationAmount.toLocaleString()}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
