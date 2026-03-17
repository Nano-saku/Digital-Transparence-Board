import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { 
  Users, Wallet, TrendingUp, TrendingDown, PieChart,
  UserCog, Calendar, CreditCard, FileText, LogOut,
  ArrowRight, Loader2
} from 'lucide-react';
import type { ViewState, FinancialSummary } from '@/types';
import { financialSummaryService, studentsService, eventsService, feedbackService } from '@/services/db';
import { toast } from 'sonner';

interface AdminDashboardSectionProps {
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
}

export default function AdminDashboardSection({ onNavigate, onLogout }: AdminDashboardSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);

  // Load data from database
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [summaryData, studentsData, eventsData, pendingFeedbackData] = await Promise.all([
        financialSummaryService.get(),
        studentsService.getAll(),
        eventsService.getAll(),
        feedbackService.getByStatus('pending'),
      ]);
      setFinancialSummary(summaryData);
      setStudentCount(studentsData.length);
      setEventCount(eventsData.length);
      setPendingFeedbackCount(pendingFeedbackData.length);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      // Headline entrance
      tl.fromTo(
        headlineRef.current,
        { x: '-30vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7 }
      );

      // Summary cards entrance
      tl.fromTo(
        summaryRef.current?.querySelectorAll('.summary-card') || [],
        { y: '-20vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.05 },
        '-=0.4'
      );

      // Quick actions entrance
      tl.fromTo(
        actionsRef.current?.querySelectorAll('.action-card') || [],
        { y: '30vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.06 },
        '-=0.3'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

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
      value: `₱${financialSummary?.totalExpectedContributions.toLocaleString() || '0'}`, 
      icon: Wallet, 
      color: 'purple',
      suffix: ''
    },
    { 
      label: 'Funds Collected', 
      value: `₱${financialSummary?.totalFundsCollected.toLocaleString() || '0'}`, 
      icon: TrendingUp, 
      color: 'green',
      suffix: ''
    },
    { 
      label: 'Funds Spent', 
      value: `₱${financialSummary?.totalFundsSpent.toLocaleString() || '0'}`, 
      icon: TrendingDown, 
      color: 'red',
      suffix: ''
    },
    { 
      label: 'Remaining Budget', 
      value: `₱${financialSummary?.remainingBudget.toLocaleString() || '0'}`, 
      icon: PieChart, 
      color: 'yellow',
      suffix: ''
    },
  ];

  const quickActions = [
    {
      title: 'Student Management',
      description: 'Add, edit, or remove student records',
      icon: UserCog,
      view: 'student-management' as ViewState,
      color: 'blue',
    },
    {
      title: 'Event Management',
      description: 'Create events and manage allocations',
      icon: Calendar,
      view: 'event-management' as ViewState,
      color: 'green',
    },
    {
      title: 'Payment Records',
      description: 'Record and track student payments',
      icon: CreditCard,
      view: 'payment-management' as ViewState,
      color: 'purple',
    },
    {
      title: 'Transaction Ledger',
      description: 'View and manage all transactions',
      icon: FileText,
      view: 'transaction-management' as ViewState,
      color: 'yellow',
    },
  ];

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
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Header */}
        <div ref={headlineRef} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="font-display font-bold text-3xl lg:text-4xl text-dark mb-2">
              Admin Dashboard
            </h1>
            <p className="text-text-secondary">
              Welcome back! Here is an overview of your council finances.
            </p>
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
        {loading && (
          <div className="glass-card p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-red" />
            <p className="text-text-secondary">Loading dashboard data...</p>
          </div>
        )}

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
                <div className="w-12 h-12 rounded-lg bg-red/10 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-red" />
                </div>
                <div>
                  <p className="font-display font-bold text-2xl text-dark">{eventCount}</p>
                  <p className="text-sm text-text-secondary">Active Events</p>
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
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-red group-hover:gap-2 transition-all">
                        Manage
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
