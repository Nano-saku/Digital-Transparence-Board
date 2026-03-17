import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  MessageCircle, AlertTriangle, Lightbulb, 
  Send, User, IdCard, EyeOff, Shield, CheckCircle, Loader2 
} from 'lucide-react';
import type { ViewState, FeedbackItem } from '@/types';
import { feedbackService } from '@/services/db';
import { toast } from 'sonner';

interface FeedbackSectionProps {
  defaultTab: ViewState;
}

export default function FeedbackSection({ defaultTab }: FeedbackSectionProps) {
  const [activeTab, setActiveTab] = useState<'inquiry' | 'complaint' | 'suggestion'>(
    defaultTab as 'inquiry' | 'complaint' | 'suggestion' || 'inquiry'
  );
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    try {
      setSubmitting(true);

      await feedbackService.create({
        type: activeTab,
        title: formData.title,
        message: formData.message,
        studentName: formData.isAnonymous ? undefined : formData.studentName,
        studentId: formData.isAnonymous ? undefined : formData.studentId,
        isAnonymous: formData.isAnonymous,
        status: 'pending',
      });

      setIsSubmitted(true);
      toast.success(`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} submitted successfully!`);

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
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getTabConfig = () => {
    switch (activeTab) {
      case 'inquiry':
        return {
          icon: MessageCircle,
          title: 'Ask a Question',
          subtitle: 'Have a question about council transactions or events?',
          placeholder: 'What would you like to know?',
          color: 'blue',
        };
      case 'complaint':
        return {
          icon: AlertTriangle,
          title: 'File a Complaint',
          subtitle: 'Report an issue or concern about council activities',
          placeholder: 'Please describe your concern in detail...',
          color: 'red',
        };
      case 'suggestion':
        return {
          icon: Lightbulb,
          title: 'Share a Suggestion',
          subtitle: 'Help us improve with your ideas and feedback',
          placeholder: 'What would you like to suggest?',
          color: 'yellow',
        };
    }
  };

  const config = getTabConfig();
  const Icon = config.icon;

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-warm relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-40 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-40 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display font-bold text-3xl lg:text-4xl text-dark mb-3">
            Feedback & Communication
          </h1>
          <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto">
            We value your input. Share your questions, concerns, or suggestions with us.
          </p>
        </div>

        {/* Tab Navigation */}
        <div ref={cardsRef} className="flex flex-wrap justify-center gap-3 mb-8">
          {(['inquiry', 'complaint', 'suggestion'] as const).map((tab) => {
            const TabIcon = tab === 'inquiry' ? MessageCircle : tab === 'complaint' ? AlertTriangle : Lightbulb;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`feedback-card glass-card px-6 py-4 flex items-center gap-3 transition-all ${
                  activeTab === tab 
                    ? 'bg-red text-white shadow-lg scale-105' 
                    : 'hover:bg-white/50'
                }`}
              >
                <TabIcon className="w-5 h-5" />
                <span className="font-medium capitalize">{tab}</span>
              </button>
            );
          })}
        </div>

        {/* Form Card */}
        <div className="max-w-2xl mx-auto">
          <div className="glass-card-strong p-6 lg:p-8">
            {/* Tab Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                activeTab === 'inquiry' ? 'bg-blue-100' : 
                activeTab === 'complaint' ? 'bg-red/10' : 'bg-yellow-100'
              }`}>
                <Icon className={`w-6 h-6 ${
                  activeTab === 'inquiry' ? 'text-blue-600' : 
                  activeTab === 'complaint' ? 'text-red' : 'text-yellow-600'
                }`} />
              </div>
              <div>
                <h2 className="font-display font-semibold text-xl text-dark">{config.title}</h2>
                <p className="text-text-secondary text-sm">{config.subtitle}</p>
              </div>
            </div>

            {isSubmitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="font-display font-semibold text-xl text-dark mb-2">
                  Thank You!
                </h3>
                <p className="text-text-secondary">
                  Your {activeTab} has been submitted successfully. We will review it and get back to you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Title (optional) */}
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5">
                    Title <span className="text-text-secondary">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="glass-input w-full px-4 py-3"
                    placeholder="Brief title for your feedback"
                    disabled={submitting}
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5">
                    Message <span className="text-red">*</span>
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="glass-input w-full px-4 py-3 min-h-[150px] resize-none"
                    placeholder={config.placeholder}
                    required
                    disabled={submitting}
                  />
                </div>

                {/* Anonymous Toggle */}
                <div className="flex items-center gap-3 p-4 glass-card">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isAnonymous: !formData.isAnonymous })}
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      formData.isAnonymous ? 'bg-red' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      formData.isAnonymous ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                  <div className="flex items-center gap-2">
                    {formData.isAnonymous ? <EyeOff className="w-4 h-4 text-text-secondary" /> : <User className="w-4 h-4 text-text-secondary" />}
                    <span className="text-sm text-text-secondary">
                      {formData.isAnonymous ? 'Submit anonymously' : 'Include my information'}
                    </span>
                  </div>
                </div>

                {/* Student Info (if not anonymous) */}
                {!formData.isAnonymous && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">
                        <User className="w-4 h-4 inline mr-1" />
                        Your Name
                      </label>
                      <input
                        type="text"
                        value={formData.studentName}
                        onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                        className="glass-input w-full px-4 py-3"
                        placeholder="Juan Dela Cruz"
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">
                        <IdCard className="w-4 h-4 inline mr-1" />
                        Student ID
                      </label>
                      <input
                        type="text"
                        value={formData.studentId}
                        onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                        className="glass-input w-full px-4 py-3"
                        placeholder="2021-00001"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full btn-primary px-6 py-3 flex items-center justify-center gap-2"
                  disabled={submitting || !formData.message.trim()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                    </>
                  )}
                </button>

                {/* Privacy Note */}
                <div className="flex items-start gap-2 text-xs text-text-secondary">
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Your feedback is important to us. All submissions are reviewed by the student council 
                    and will be handled with confidentiality. Anonymous submissions cannot receive direct responses.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
