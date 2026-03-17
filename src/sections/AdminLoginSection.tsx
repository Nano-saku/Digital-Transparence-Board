import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Shield, Lock, User, Eye, EyeOff } from 'lucide-react';

interface AdminLoginSectionProps {
  onLogin: (username: string, password: string) => void;
}

export default function AdminLoginSection({ onLogin }: AdminLoginSectionProps) {
  const [username, setUsername] = useState('');
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
    setIsLoading(true);
    
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 500));
    
    onLogin(username, password);
    setIsLoading(false);
  };

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-red relative overflow-hidden flex items-center justify-center"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6">
        <div 
          ref={cardRef}
          className="glass-card-strong max-w-md mx-auto p-8 lg:p-10"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-red/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red" />
            </div>
            <h2 className="font-display font-semibold text-2xl text-dark mb-2">
              Admin Access
            </h2>
            <p className="text-text-secondary text-sm">
              Authorized personnel only
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-text-secondary" />
                  Username
                </span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="glass-input w-full px-4 py-3.5 text-sm"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1.5">
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
                  className="glass-input w-full px-4 py-3.5 text-sm pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/50 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-text-secondary" />
                  ) : (
                    <Eye className="w-4 h-4 text-text-secondary" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Login</span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-white/50 text-center">
            <p className="text-xs text-text-secondary flex items-center justify-center gap-1.5">
              <Shield className="w-3 h-3" />
              All actions are logged for security purposes
            </p>
          </div>

          {/* Demo Credentials */}
          <div className="mt-4 p-3 rounded-xl bg-white/30 text-center">
            <p className="text-xs text-text-secondary mb-1">Demo Credentials:</p>
            <p className="text-xs font-medium text-dark">Username: admin | Password: admin</p>
          </div>
        </div>
      </div>
    </section>
  );
}
