import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface ForgotPasswordSectionProps {
  onRequestReset: (email: string) => Promise<void>;
  onBack: () => void;
}

export default function ForgotPasswordSection({
  onRequestReset,
  onBack,
}: ForgotPasswordSectionProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        { scale: 0.85, y: '10vh', opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    try {
      setIsLoading(true);
      await onRequestReset(email);
      // Always show the "check your email" state, whether or not the
      // address exists — this avoids leaking which emails are registered.
      setSent(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-red relative overflow-x-hidden overflow-y-auto flex items-center justify-center py-6 sm:py-8"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl" style={{ background: 'rgba(110,140,255,0.15)' }} />
        <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(14,26,77,0.40)' }} />
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
          <img src="/lsc-logo.jpg" alt="" className="w-[480px] h-[480px] object-contain" />
        </div>
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6">
        <div ref={cardRef} className="glass-card-strong w-full max-w-sm mx-auto p-6 sm:p-7">
          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ring-2 ring-lsc-gold/50" style={{ background: 'var(--dssc-off-white)' }}>
                <ShieldCheck className="w-6 h-6" style={{ color: 'var(--dssc-deep-navy)' }} />
              </div>
              <h2 className="font-display font-bold text-2xl mb-2" style={{ color: 'var(--dssc-deep-navy)' }}>
                Check your email
              </h2>
              <p className="text-text-secondary text-sm mb-6">
                If <span className="font-medium">{email}</span> is a registered officer account,
                a password reset link is on its way. It's valid for a limited time.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="btn-secondary w-full py-3 justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to sign in</span>
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <img
                  src="/lsc-logo.jpg"
                  alt="LSC Seal"
                  className="w-14 h-14 rounded-full object-cover mx-auto mb-3 ring-2 ring-lsc-gold/50"
                />
                <h2 className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--dssc-deep-navy)' }}>
                  Reset Password
                </h2>
                <p className="text-text-secondary text-sm">
                  Enter your officer email and we'll send you a reset link
                </p>
                <div className="mx-auto mt-3 h-0.5 w-12 rounded-full" style={{ background: 'var(--dssc-gold)' }} />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dssc-deep-navy)' }}>
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-text-secondary" />
                      Email
                    </span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@studentboard.ph"
                    className="glass-input w-full px-4 py-3 text-sm"
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full py-3 justify-center disabled:opacity-70"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onBack}
                  className="w-full text-center text-sm font-medium text-text-secondary hover:text-deep-navy transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </button>
              </form>
            </>
          )}
        </div>

        <p className="dssc-tagline text-center mt-4">One Step Better Than Yesterday.</p>
      </div>
    </section>
  );
}
