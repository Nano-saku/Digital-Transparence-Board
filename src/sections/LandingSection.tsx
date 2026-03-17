import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Search, ChevronDown, Eye, Loader2 } from 'lucide-react';

interface LandingSectionProps {
  onSearch: (name: string, studentId: string) => void;
  onViewTransparency: () => void;
  searching?: boolean;
}

export default function LandingSection({ onSearch, onViewTransparency, searching = false }: LandingSectionProps) {
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');

  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Initial animation timeline
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      // Background fade in
      tl.fromTo(
        sectionRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.6 }
      );

      // Headline animation
      tl.fromTo(
        headlineRef.current?.querySelectorAll('.word') || [],
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, stagger: 0.03 },
        '-=0.3'
      );

      // Search card animation
      tl.fromTo(
        cardRef.current,
        { x: '10vw', scale: 0.96, opacity: 0 },
        { x: 0, scale: 1, opacity: 1, duration: 0.8 },
        '-=0.5'
      );

      // Scroll hint
      tl.fromTo(
        scrollHintRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.4 },
        '-=0.2'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searching) {
      onSearch(name, studentId);
    }
  };

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-20">
        <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Column - Headline */}
          <div ref={headlineRef} className="text-center lg:text-left">
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-dark leading-tight mb-6">
              <span className="word inline-block">Digital</span>{' '}
              <span className="word inline-block">Transparency</span>{' '}
              <span className="word inline-block text-red">Board</span>
            </h1>
            <p className="text-text-secondary text-lg sm:text-xl max-w-xl mx-auto lg:mx-0 mb-8">
              Track your contributions, attendance, and council finances in real-time. 
              Transparency for a stronger student community.
            </p>
            <button
              onClick={onViewTransparency}
              className="glass-button px-6 py-3 flex items-center gap-2 mx-auto lg:mx-0"
            >
              <Eye className="w-5 h-5" />
              <span>View Transparency Board</span>
            </button>
          </div>

          {/* Right Column - Search Card */}
          <div ref={cardRef} className="glass-card-strong p-6 sm:p-8">
            <h2 className="font-display font-semibold text-2xl text-dark mb-2">
              Find Your Records
            </h2>
            <p className="text-text-secondary mb-6">
              Enter your name or student ID to view your contributions and attendance.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">
                  Student Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input w-full px-4 py-3"
                  placeholder="e.g., Juan Dela Cruz"
                  disabled={searching}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-2 bg-white/50 text-xs text-text-secondary">OR</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">
                  Student ID
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="glass-input w-full px-4 py-3"
                  placeholder="e.g., 2021-00001"
                  disabled={searching}
                />
              </div>

              <button
                type="submit"
                className="w-full btn-primary px-6 py-3 flex items-center justify-center gap-2"
                disabled={searching || (!name && !studentId)}
              >
                {searching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Search Records
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Scroll Hint */}
      <div 
        ref={scrollHintRef}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-secondary"
      >
        <span className="text-sm">Scroll to learn more</span>
        <ChevronDown className="w-5 h-5 animate-bounce" />
      </div>
    </section>
  );
}
