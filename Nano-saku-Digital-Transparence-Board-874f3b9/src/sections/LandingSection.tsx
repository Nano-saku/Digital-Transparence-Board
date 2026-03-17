import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Search, ChevronDown, Eye } from 'lucide-react';

interface LandingSectionProps {
  onSearch: (name: string, studentId: string) => void;
  onViewTransparency: () => void;
}

export default function LandingSection({ onSearch, onViewTransparency }: LandingSectionProps) {
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
    onSearch(name, studentId);
  };

  return (
    <section 
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center">
        <div className="w-full px-6 lg:px-16 xl:px-24 py-20 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center max-w-7xl mx-auto">
            {/* Left: Headline */}
            <div ref={headlineRef} className="text-center lg:text-left">
              <h1 className="font-display font-bold text-dark leading-none mb-6">
                <span className="block text-4xl sm:text-5xl lg:text-6xl xl:text-7xl">
                  {'Student'.split('').map((char, i) => (
                    <span key={i} className="word inline-block">{char}</span>
                  ))}
                </span>
                <span className="block text-4xl sm:text-5xl lg:text-6xl xl:text-7xl mt-2">
                  {'Digital'.split('').map((char, i) => (
                    <span key={i} className="word inline-block">{char}</span>
                  ))}
                </span>
                <span className="block text-4xl sm:text-5xl lg:text-6xl xl:text-7xl mt-2 text-white">
                  {'Board'.split('').map((char, i) => (
                    <span key={i} className="word inline-block">{char}</span>
                  ))}
                </span>
              </h1>
              
              <p className="text-dark/80 text-base lg:text-lg max-w-md mx-auto lg:mx-0 leading-relaxed">
                Search your attendance, contributions, and receipts—fast, clear, and transparent.
              </p>
            </div>

            {/* Right: Search Card */}
            <div className="flex justify-center lg:justify-end">
              <div 
                ref={cardRef}
                className="glass-card-strong w-full max-w-md p-6 lg:p-8"
              >
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-xl bg-red/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-6 h-6 text-red" />
                  </div>
                  <h2 className="font-display font-semibold text-xl text-dark">
                    Find Your Record
                  </h2>
                  <p className="text-text-secondary text-sm mt-1">
                    Enter your details to view your records
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-dark mb-1.5">
                      Student Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Juan Dela Cruz"
                      className="glass-input w-full px-4 py-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark mb-1.5">
                      Student ID
                    </label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="e.g., 2021-00001"
                      className="glass-input w-full px-4 py-3 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    <span>Search Record</span>
                  </button>
                </form>

                <div className="mt-5 pt-5 border-t border-white/50">
                  <button
                    onClick={onViewTransparency}
                    className="w-full flex items-center justify-center gap-2 text-sm text-red hover:text-red/80 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Or view the Transparency Board</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Hint */}
      <div 
        ref={scrollHintRef}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center"
      >
        <span className="text-dark/60 text-sm font-medium">Scroll to explore</span>
        <div className="mt-2 animate-bounce">
          <ChevronDown className="w-5 h-5 text-dark/60 mx-auto" />
        </div>
      </div>
    </section>
  );
}
