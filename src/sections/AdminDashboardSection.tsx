import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  Users, Wallet, TrendingUp, TrendingDown, PieChart,
  UserCog, Calendar, CreditCard, FileText, LogOut,
  ArrowRight
} from 'lucide-react';
import type { ViewState } from '@/types';
import { financialSummary, students, events } from '@/data/store';

interface AdminDashboardSectionProps {
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
}

export default function AdminDashboardSection({ onNavigate, onLogout }: AdminDashboardSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

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

  const totalExpectedContributions = events.reduce((sum, event) => {
    return sum + (event.allocationAmount * students.length);
  }, 0);

  const summaryCards = [
    { 
      label: 'Total Students', 
      value: students.length.toString(), 
      icon: Users, 
      color: 'blue',
      suffix: ''
    },
    { 
      label: 'Expected Contributions', 
      value: `₱${totalExpectedContributions.toLocaleString()}`, 
      icon: Wallet, 
      color: 'purple',
      suffix: ''
    },
    { 
      label: 'Total Collected', 
      value: `₱${financialSummary.totalFundsCollected.toLocaleString()}`, 
      icon: TrendingUp, 
      color: 'green',
      suffix: ''
    },
    { 
      label: 'Remaining', 
      value: `₱${(totalExpectedContributions - financialSummary.totalFundsCollected).toLocaleString()}`, 
      icon: TrendingDown, 
      color: 'orange',
      suffix: ''
    },
    { 
      label: 'Total Budget', 
      value: `₱${financialSummary.totalBudget.toLocaleString()}`, 
      icon: PieChart, 
      color: 'red',
      suffix: ''
    },
    { 
      label: 'Total Spent', 
      value: `₱${financialSummary.totalFundsSpent.toLocaleString()}`, 
      icon: Wallet, 
      color: 'red',
      suffix: ''
    },
  ];

  const quickActions = [
    {
      label: 'Student Management',
      description: 'Add, edit, or remove student records',
      icon: UserCog,
      view: 'student-management' as ViewState,
      color: 'blue',
    },
    {
      label: 'Event & Allocation',
      description: 'Manage events and budget allocations',
      icon: Calendar,
      view: 'event-management' as ViewState,
      color: 'purple',
    },
    {
      label: 'Payment & Attendance',
      description: 'Record payments and mark attendance',
      icon: CreditCard,
      view: 'payment-management' as ViewState,
      color: 'green',
    },
    {
      label: 'Transparency & Reports',
      description: 'View transactions and audit logs',
      icon: FileText,
      view: 'transaction-management' as ViewState,
      color: 'orange',
    },
  ];

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 right-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div ref={headlineRef}>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-dark mb-2">
              Admin Dashboard
            </h1>
            <p className="text-dark/70">
              Overview of students, collections, and council finances.
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

        {/* Summary Cards */}
        <div ref={summaryRef} className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4 mb-8">
          {summaryCards.map((card, index) => (
            <div 
              key={index} 
              className="summary-card glass-card-strong p-4 lg:p-5 hover:scale-105 transition-transform"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  card.color === 'blue' ? 'bg-blue-100' :
                  card.color === 'purple' ? 'bg-purple-100' :
                  card.color === 'green' ? 'bg-green-100' :
                  card.color === 'orange' ? 'bg-orange-100' :
                  'bg-red/10'
                }`}>
                  <card.icon className={`w-4 h-4 ${
                    card.color === 'blue' ? 'text-blue-600' :
                    card.color === 'purple' ? 'text-purple-600' :
                    card.color === 'green' ? 'text-green-600' :
                    card.color === 'orange' ? 'text-orange-600' :
                    'text-red'
                  }`} />
                </div>
                <span className="text-xs text-text-secondary">{card.label}</span>
              </div>
              <p className="font-display font-bold text-lg lg:text-xl text-dark">
                {card.value}{card.suffix}
              </p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="font-display font-semibold text-xl text-dark mb-4">
            Quick Actions
          </h2>
          <div ref={actionsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => onNavigate(action.view)}
                className="action-card glass-card p-5 text-left hover:scale-[1.02] transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  action.color === 'blue' ? 'bg-blue-100' :
                  action.color === 'purple' ? 'bg-purple-100' :
                  action.color === 'green' ? 'bg-green-100' :
                  'bg-orange-100'
                }`}>
                  <action.icon className={`w-6 h-6 ${
                    action.color === 'blue' ? 'text-blue-600' :
                    action.color === 'purple' ? 'text-purple-600' :
                    action.color === 'green' ? 'text-green-600' :
                    'text-orange-600'
                  }`} />
                </div>
                <h3 className="font-display font-semibold text-dark mb-1">
                  {action.label}
                </h3>
                <p className="text-sm text-text-secondary mb-3">
                  {action.description}
                </p>
                <div className="flex items-center gap-1 text-red text-sm font-medium group-hover:gap-2 transition-all">
                  <span>Manage</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
