import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Shield, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
interface AdminLoginSectionProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function AdminLoginSection({ onLogin }: AdminLoginSectionProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
    if (!email.trim() || !password) {
      toast.error('Please enter your email and password');
      return;
    }
    try {
      setIsLoading(true);
      // onLogin resolves after a successful sign-in; the app then shows the
      // dashboard. Any failure throws and is surfaced here.
      await onLogin(email, password);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Login failed. Please try again.'
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
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl" style={{ background: 'rgba(110,140,255,0.15)' }} />
        <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(14,26,77,0.40)' }} />
        {/* Seal watermark — centered */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
          <img src="/lsc-logo.jpg" alt="" className="w-[480px] h-[480px] object-contain" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6">
        <div 
          ref={cardRef}
          className="glass-card-strong w-full max-w-sm mx-auto p-6 sm:p-7"
        >
          {/* Header */}
          <div className="text-center mb-6">
            <img
              src="/lsc-logo.jpg"
              alt="LSC Seal"
              className="w-14 h-14 rounded-full object-cover mx-auto mb-3 ring-2 ring-lsc-gold/50"
            />
            <h2 className="font-display font-bold text-2xl mb-1" style={{ color: 'var(--dssc-deep-navy)' }}>
              Admin Access
            </h2>
            <p className="text-text-secondary text-sm">
              Sign in with your officer account
            </p>
            {/* Gold divider */}
            <div className="mx-auto mt-3 h-0.5 w-12 rounded-full" style={{ background: 'var(--dssc-gold)' }} />
          </div>

          {/* Form */}
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

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dssc-deep-navy)' }}>
                <span className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-text-secondary" />
                  Password
                </span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="glass-input w-full px-4 py-3 text-sm pr-12"
                  required
                />
                <button
                  type="button"
onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-text-secondary hover:text-deep-navy transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
disabled={isLoading}
              className="btn-primary w-full py-3 justify-center disabled:opacity-70"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-5 pt-5 border-t border-silver-gray/30 text-center">
            <p className="text-xs text-text-secondary flex items-center justify-center gap-1.5">
              <Shield className="w-3 h-3" />
              All actions are logged for security purposes
            </p>
          </div>

          {/* Contact note */}
          <div className="mt-3 p-3 rounded-xl text-center" style={{ background: 'var(--dssc-off-white)' }}>
            <p className="text-xs text-text-secondary">
              Don't have an account? Ask the Student Council Administrator to
              create one for you.
            </p>
          </div>
        </div>

        {/* Tagline below card */}
        <p className="dssc-tagline text-center mt-4">One Step Better Than Yesterday.</p>
      </div>
    </section>
  );
}
