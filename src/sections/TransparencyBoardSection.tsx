import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { 
  TrendingUp, TrendingDown, Wallet, PieChart, 
  FileText, Download, Eye, MessageCircle, Receipt,
  ArrowLeft, Search, Filter, Loader2
} from 'lucide-react';
import type { ViewState, Transaction, EventAllocation, FinancialSummary } from '@/types';
import { transactionsService, eventAllocationsService, financialSummaryService } from '@/services/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface TransparencyBoardSectionProps {
  adminMode?: boolean;
  onBack?: () => void;
  onNavigate?: (view: ViewState) => void;
}

export default function TransparencyBoardSection({ adminMode = false, onBack, onNavigate }: TransparencyBoardSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const allocationRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Data states
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [eventAllocations, setEventAllocations] = useState<EventAllocation[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Load data from database
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryData, allocationsData, transactionsData] = await Promise.all([
        financialSummaryService.get(),
        eventAllocationsService.getAll(),
        transactionsService.getAll(),
      ]);
      setFinancialSummary(summaryData);
      setEventAllocations(allocationsData);
      setTransactions(transactionsData);
    } catch (error) {
      console.error('Error loading transparency data:', error);
      toast.error('Failed to load financial data');
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
        { x: '-40vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7 }
      );

      // Summary cards entrance
      tl.fromTo(
        summaryRef.current?.querySelectorAll('.summary-card') || [],
        { y: '-30vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.06 },
        '-=0.4'
      );

      // Allocation table entrance
      tl.fromTo(
        allocationRef.current,
        { x: '-60vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7 },
        '-=0.3'
      );

      // Ledger entrance
      tl.fromTo(
        ledgerRef.current,
        { x: '60vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7 },
        '-=0.5'
      );

      // CTA row entrance
      tl.fromTo(
        ctaRef.current,
        { y: '30vh', opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
        '-=0.3'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const filteredTransactions = transactions.filter(t => 
    t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.eventName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-warm relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-40 w-80 h-80 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-20 right-40 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Admin Back Button */}
        {adminMode && onBack && (
          <div className="mb-6">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-white/50 transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5 text-dark" />
              <span className="text-dark">Back to Dashboard</span>
            </button>
          </div>
        )}

        {/* Headline */}
        <div ref={headlineRef} className="text-center mb-10">
          <h1 className="font-display font-bold text-3xl lg:text-4xl xl:text-5xl text-dark mb-3">
            Transparency Board
          </h1>
          <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto">
            Real-time financial transparency. Track every contribution, expense, and allocation.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="glass-card p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-red" />
            <p className="text-text-secondary">Loading financial data...</p>
          </div>
        )}

        {!loading && (
          <>
            {/* Financial Summary */}
            <div ref={summaryRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Total Budget</span>
                </div>
                <p className="font-display font-bold text-2xl text-dark">
                  ₱{financialSummary?.totalBudget.toLocaleString() || '0'}
                </p>
              </div>

              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Funds Collected</span>
                </div>
                <p className="font-display font-bold text-2xl text-green-600">
                  ₱{financialSummary?.totalFundsCollected.toLocaleString() || '0'}
                </p>
              </div>

              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Funds Spent</span>
                </div>
                <p className="font-display font-bold text-2xl text-red">
                  ₱{financialSummary?.totalFundsSpent.toLocaleString() || '0'}
                </p>
              </div>

              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <PieChart className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Remaining</span>
                </div>
                <p className="font-display font-bold text-2xl text-purple-600">
                  ₱{financialSummary?.remainingBudget.toLocaleString() || '0'}
                </p>
              </div>
            </div>

            {/* Event Allocations */}
            <div ref={allocationRef} className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <PieChart className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Event Allocations</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Allocation</th>
                      <th>Collected</th>
                      <th>Spent</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventAllocations.map((allocation) => (
                      <tr key={allocation.eventId}>
                        <td className="font-medium text-dark">{allocation.eventName}</td>
                        <td className="text-text-secondary">₱{allocation.allocationAmount.toLocaleString()}</td>
                        <td className="text-green-600">₱{allocation.totalCollected.toLocaleString()}</td>
                        <td className="text-red">₱{allocation.totalSpent.toLocaleString()}</td>
                        <td className="font-medium text-dark">₱{allocation.remainingBalance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {eventAllocations.length === 0 && (
                <div className="text-center py-8 text-text-secondary">
                  <PieChart className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No event allocations found</p>
                </div>
              )}
            </div>

            {/* Transaction Ledger */}
            <div ref={ledgerRef} className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">Transaction Ledger</h3>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="glass-input pl-10 pr-4 py-2 text-sm w-full sm:w-64"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Event</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Officer</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="text-text-secondary">{formatDate(transaction.date)}</td>
                        <td className="font-medium text-dark">{transaction.description}</td>
                        <td className="text-text-secondary">{transaction.eventName || '-'}</td>
                        <td>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            transaction.type === 'income' 
                              ? 'bg-green-100 text-green-600' 
                              : 'bg-red/10 text-red'
                          }`}>
                            {transaction.type === 'income' ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td className={`font-medium ${
                          transaction.type === 'income' ? 'text-green-600' : 'text-red'
                        }`}>
                          {transaction.type === 'income' ? '+' : '-'}₱{transaction.amount.toLocaleString()}
                        </td>
                        <td className="text-text-secondary">{transaction.responsibleOfficer}</td>
                        <td>
                          {transaction.receiptUrl ? (
                            <button 
                              onClick={() => setSelectedReceipt(transaction.receiptUrl || null)}
                              className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                            >
                              <Receipt className="w-4 h-4 text-red" />
                            </button>
                          ) : (
                            <span className="text-text-secondary/50">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredTransactions.length === 0 && (
                <div className="text-center py-8 text-text-secondary">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No transactions found</p>
                </div>
              )}
            </div>

            {/* CTA Row */}
            {!adminMode && onNavigate && (
              <div ref={ctaRef} className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={() => onNavigate('inquiry')}
                  className="glass-button px-6 py-3 flex items-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Submit Inquiry</span>
                </button>
                <button className="glass-button px-6 py-3 flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  <span>Download Report</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Receipt Modal */}
      <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Receipt
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
