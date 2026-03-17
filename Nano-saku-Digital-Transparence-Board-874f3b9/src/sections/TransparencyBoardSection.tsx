import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { 
  TrendingUp, TrendingDown, Wallet, PieChart, 
  FileText, Download, Eye, MessageCircle, Receipt,
  ArrowLeft, Search, Filter
} from 'lucide-react';
import type { ViewState } from '@/types';
import { financialSummary, eventAllocations, transactions, receipts, auditLogs } from '@/data/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
        {/* Back Button (Admin Mode) */}
        {adminMode && onBack && (
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-2 text-dark/80 hover:text-red transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Dashboard</span>
          </button>
        )}

        {/* Headline */}
        <div ref={headlineRef} className="mb-8">
          <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-dark mb-3">
            Transparency Board
          </h1>
          <p className="text-dark/70 text-base lg:text-lg max-w-xl">
            See how funds are collected, allocated, and spent—down to the last receipt.
          </p>
        </div>

        {/* Summary Cards */}
        <div ref={summaryRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <div className="summary-card glass-card-strong p-4 lg:p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-red" />
              </div>
              <span className="text-sm text-text-secondary">Total Budget</span>
            </div>
            <p className="font-display font-bold text-xl lg:text-2xl text-dark">
              ₱{financialSummary.totalBudget.toLocaleString()}
            </p>
          </div>

          <div className="summary-card glass-card-strong p-4 lg:p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-text-secondary">Total Collected</span>
            </div>
            <p className="font-display font-bold text-xl lg:text-2xl text-green-600">
              ₱{financialSummary.totalFundsCollected.toLocaleString()}
            </p>
          </div>

          <div className="summary-card glass-card-strong p-4 lg:p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-sm text-text-secondary">Total Spent</span>
            </div>
            <p className="font-display font-bold text-xl lg:text-2xl text-orange-600">
              ₱{financialSummary.totalFundsSpent.toLocaleString()}
            </p>
          </div>

          <div className="summary-card glass-card-strong p-4 lg:p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <PieChart className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-text-secondary">Remaining</span>
            </div>
            <p className="font-display font-bold text-xl lg:text-2xl text-blue-600">
              ₱{financialSummary.remainingBudget.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="allocation" className="w-full">
          <TabsList className="glass-card mb-4 p-1 w-full flex flex-wrap gap-1">
            <TabsTrigger value="allocation" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
              Allocations
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
              Transaction Ledger
            </TabsTrigger>
            <TabsTrigger value="receipts" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
              Receipts
            </TabsTrigger>
            {adminMode && (
              <TabsTrigger value="audit" className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white">
                Audit Log
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="allocation">
            <div ref={allocationRef} className="glass-card p-5 lg:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <PieChart className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Financial Allocation by Event</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Allocation</th>
                      <th>Collected</th>
                      <th>Spent</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventAllocations.map((allocation) => (
                      <tr key={allocation.eventId}>
                        <td className="font-medium text-dark">{allocation.eventName}</td>
                        <td className="text-text-secondary">₱{allocation.allocationAmount.toLocaleString()}</td>
                        <td className="text-green-600 font-medium">₱{allocation.totalCollected.toLocaleString()}</td>
                        <td className="text-orange-600 font-medium">₱{allocation.totalSpent.toLocaleString()}</td>
                        <td>
                          <span className={`font-medium ${allocation.remainingBalance >= 0 ? 'text-blue-600' : 'text-red'}`}>
                            ₱{allocation.remainingBalance.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ledger">
            <div ref={ledgerRef} className="glass-card p-5 lg:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
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
                      <th>Amount</th>
                      <th>Officer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="text-text-secondary text-sm">{formatDate(transaction.date)}</td>
                        <td className="font-medium text-dark">{transaction.description}</td>
                        <td className="text-text-secondary text-sm">{transaction.eventName || '-'}</td>
                        <td>
                          <span className={`font-medium ${transaction.type === 'income' ? 'text-green-600' : 'text-orange-600'}`}>
                            {transaction.type === 'income' ? '+' : '-'}₱{transaction.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="text-text-secondary text-sm">{transaction.responsibleOfficer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="receipts">
            <div className="glass-card p-5 lg:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Receipt Archive</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {receipts.map((receipt) => (
                  <button
                    key={receipt.id}
                    onClick={() => setSelectedReceipt(receipt.url)}
                    className="glass-card p-3 hover:scale-105 transition-transform text-left group"
                  >
                    <div className="aspect-square rounded-xl bg-red/5 flex items-center justify-center mb-3 group-hover:bg-red/10 transition-colors">
                      <Receipt className="w-8 h-8 text-red/60" />
                    </div>
                    <p className="text-xs font-medium text-dark truncate">{receipt.title}</p>
                    <p className="text-xs text-text-secondary">{formatDate(receipt.uploadedAt)}</p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {adminMode && (
            <TabsContent value="audit">
              <div className="glass-card p-5 lg:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <Filter className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">Audit Log</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Data Modified</th>
                        <th>Admin</th>
                        <th>Changes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="text-text-secondary text-sm whitespace-nowrap">{log.date}</td>
                          <td className="font-medium text-dark">{log.action}</td>
                          <td className="text-text-secondary text-sm">{log.dataModified}</td>
                          <td className="text-text-secondary text-sm">{log.responsibleAdmin}</td>
                          <td className="text-sm">
                            {log.previousValue && log.newValue ? (
                              <span className="text-dark">
                                <span className="text-red line-through">{log.previousValue}</span>
                                {' → '}
                                <span className="text-green-600">{log.newValue}</span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* CTA Row */}
        {!adminMode && (
          <div ref={ctaRef} className="flex flex-wrap gap-3 mt-6">
            <button className="btn-secondary px-5 py-2.5 flex items-center gap-2">
              <Download className="w-4 h-4" />
              <span>Download Report</span>
            </button>
            <button 
              onClick={() => setSelectedReceipt(receipts[0]?.url || null)}
              className="glass-button px-5 py-2.5 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              <span>View Receipts</span>
            </button>
            <button 
              onClick={() => onNavigate && onNavigate('inquiry')}
              className="glass-button px-5 py-2.5 flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Ask a Question</span>
            </button>
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Receipt Preview</DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-red/5 rounded-xl flex items-center justify-center">
            <div className="text-center text-text-secondary">
              <Receipt className="w-16 h-16 mx-auto mb-3 opacity-40" />
              <p>Receipt image would be displayed here</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
