import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  MessageCircle, AlertTriangle, Lightbulb, 
  Send, User, IdCard, EyeOff, Shield, CheckCircle 
} from 'lucide-react';
import type { ViewState } from '@/types';

interface FeedbackSectionProps {
  defaultTab: ViewState;
}

export default function FeedbackSection({ defaultTab }: FeedbackSectionProps) {
  const [activeTab, setActiveTab] = useState<'inquiry' | 'complaint' | 'suggestion'>(
    defaultTab as 'inquiry' | 'complaint' | 'suggestion' || 'inquiry'
  );
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    studentName: '',
    studentId: '',
    isAnonymous: false,
  });

  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardsRef.current?.querySelectorAll('.feedback-card') || [],
        { y: '8vh', opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.5, 
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: cardsRef.current,
            start: 'top 80%',
            end: 'top 45%',
            scrub: false,
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate submission
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({
        title: '',
        message: '',
        studentName: '',
        studentId: '',
        isAnonymous: false,
      });
    }, 3000);
  };

  const getTabConfig = () => {
    switch (activeTab) {
      case 'inquiry':
        return {
          icon: MessageCircle,
          title: 'Ask a Question',
          subtitle: 'Have a question about council transactions or records? Ask us here.',
          color: 'blue',
          placeholder: 'Type your question here...',
          showTitle: false,
        };
      case 'complaint':
        return {
          icon: AlertTriangle,
          title: 'Submit a Complaint',
          subtitle: 'File a formal complaint regarding any council matter.',
          color: 'red',
          placeholder: 'Describe your complaint in detail...',
          showTitle: true,
        };
      case 'suggestion':
        return {
          icon: Lightbulb,
          title: 'Share a Suggestion',
          subtitle: 'Have ideas to improve the student council? We\'d love to hear them.',
          color: 'orange',
          placeholder: 'Share your suggestion here...',
          showTitle: true,
        };
    }
  };

  const config = getTabConfig();
  const Icon = config.icon;

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
        <div className="max-w-3xl mx-auto">
          {/* Tab Navigation */}
          <div className="glass-card p-1.5 mb-6 flex flex-wrap gap-1">
            {[
              { key: 'inquiry', label: 'Inquiry', icon: MessageCircle },
              { key: 'complaint', label: 'Complaint', icon: AlertTriangle },
              { key: 'suggestion', label: 'Suggestion', icon: Lightbulb },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                  activeTab === tab.key
                    ? 'bg-red text-white'
                    : 'hover:bg-white/50 text-dark'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Form Card */}
          <div ref={cardsRef}>
            <div className="feedback-card glass-card-strong p-6 lg:p-8">
              {isSubmitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-display font-semibold text-xl text-dark mb-2">
                    Submitted Successfully!
                  </h3>
                  <p className="text-text-secondary">
                    Thank you for your {activeTab}. We will review it shortly.
                  </p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      activeTab === 'inquiry' ? 'bg-blue-100' :
                      activeTab === 'complaint' ? 'bg-red/10' : 'bg-orange-100'
                    }`}>
                      <Icon className={`w-6 h-6 ${
                        activeTab === 'inquiry' ? 'text-blue-600' :
                        activeTab === 'complaint' ? 'text-red' : 'text-orange-600'
                      }`} />
                    </div>
                    <div>
                      <h2 className="font-display font-semibold text-xl text-dark">
                        {config.title}
                      </h2>
                      <p className="text-text-secondary text-sm">{config.subtitle}</p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Title (for complaint and suggestion) */}
                    {config.showTitle && (
                      <div>
                        <label className="block text-sm font-medium text-dark mb-1.5">
                          Title
                        </label>
                        <input
                          type="text"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          placeholder={`Enter a title for your ${activeTab}`}
                          className="glass-input w-full px-4 py-3 text-sm"
                          required
                        />
                      </div>
                    )}

                    {/* Message */}
                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">
                        {activeTab === 'inquiry' ? 'Your Question' : 'Description'}
                      </label>
                      <textarea
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        placeholder={config.placeholder}
                        rows={5}
                        className="glass-input w-full px-4 py-3 text-sm resize-none"
                        required
                      />
                    </div>

                    {/* Optional Info */}
                    {!formData.isAnonymous && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-dark mb-1.5">
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-text-secondary" />
                              Your Name <span className="text-text-secondary font-normal">(optional)</span>
                            </span>
                          </label>
                          <input
                            type="text"
                            value={formData.studentName}
                            onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                            placeholder="e.g., Juan Dela Cruz"
                            className="glass-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-dark mb-1.5">
                            <span className="flex items-center gap-1.5">
                              <IdCard className="w-4 h-4 text-text-secondary" />
                              Student ID <span className="text-text-secondary font-normal">(optional)</span>
                            </span>
                          </label>
                          <input
                            type="text"
                            value={formData.studentId}
                            onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                            placeholder="e.g., 2021-00001"
                            className="glass-input w-full px-4 py-3 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* Anonymous Checkbox */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/30">
                      <input
                        type="checkbox"
                        id="anonymous"
                        checked={formData.isAnonymous}
                        onChange={(e) => setFormData({ ...formData, isAnonymous: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-red focus:ring-red"
                      />
                      <label htmlFor="anonymous" className="flex items-center gap-2 text-sm text-dark cursor-pointer">
                        <EyeOff className="w-4 h-4 text-text-secondary" />
                        <span>Submit anonymously</span>
                      </label>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Privacy Notice */}
            <div className="feedback-card mt-4 glass-card p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-red flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-dark font-medium mb-1">Privacy Notice</p>
                <p className="text-sm text-text-secondary">
                  This platform collects limited student information for attendance monitoring and financial transparency purposes. 
                  All data is handled in compliance with the <span className="font-medium text-dark">Data Privacy Act of 2012 (RA 10173)</span>. 
                  Only authorized administrators can modify records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
