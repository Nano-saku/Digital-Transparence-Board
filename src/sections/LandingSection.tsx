import { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Search, ChevronDown, Eye, Loader2 } from "lucide-react";
import type { Student } from "@/types";
import { studentsService } from "@/services/db";
import LSCOfficerCarousel from "@/components/LSCOfficerCarousel";
interface LandingSectionProps {
  onSearch: (name: string, studentId: string) => void;
  onViewTransparency: () => void;
  searching?: boolean;
}

export default function LandingSection({
  onSearch,
  onViewTransparency,
  searching = false,
}: LandingSectionProps) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentMatches, setStudentMatches] = useState<Student[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);
  const handleNameChange = (value: string) => {
    setName(value);

    if (!value.trim()) {
      setStudentMatches([]);
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!name.trim()) {
        setStudentMatches([]);
        return;
      }

      setSearchLoading(true);

      try {
        const matches = await studentsService.search(name.trim());

        setStudentMatches(matches.slice(0, 8));
        setShowSuggestions(true);
      } catch (error) {
        console.error("Student search failed:", error);
        setStudentMatches([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [name]);
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Initial animation timeline
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Background fade in
      tl.fromTo(
        sectionRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.6 },
      );

      // Headline animation
      tl.fromTo(
        headlineRef.current?.querySelectorAll(".word") || [],
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, stagger: 0.03 },
        "-=0.3",
      );

      // Search card animation
      tl.fromTo(
        cardRef.current,
        { x: "10vw", scale: 0.96, opacity: 0 },
        { x: 0, scale: 1, opacity: 1, duration: 0.8 },
        "-=0.5",
      );

      // Scroll hint
      tl.fromTo(
        scrollHintRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.4 },
        "-=0.2",
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
    <>
      <section
        ref={sectionRef}
        className="min-h-screen w-full gradient-bg-orange relative overflow-hidden"
      >
        {/* Subtle orb overlays for depth */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-16 left-10 w-80 h-80 rounded-full blur-3xl"
            style={{ background: "rgba(110,140,255,0.18)" }}
          />
          <div
            className="absolute bottom-20 right-10 w-[28rem] h-[28rem] rounded-full blur-3xl"
            style={{ background: "rgba(14,26,77,0.35)" }}
          />
          {/* Watermark seal */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 opacity-[0.06]"
            style={{
              backgroundImage: "url(/lsc-logo.jpg)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-24">
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            {/* Left Column - Headline */}
            <div ref={headlineRef} className="text-center lg:text-left">
              {/* Eyebrow */}
              <span className="dssc-tagline block mb-3">
                One Step Better Than Yesterday.
              </span>

              <h1
                className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-white leading-tight mb-6"
                style={{ letterSpacing: "0.02em" }}
              >
                <span className="word inline-block">Digital</span>{" "}
                <span className="word inline-block">Transparency</span>{" "}
                <span
                  className="word inline-block"
                  style={{ color: "#C9A34E" }}
                >
                  Board
                </span>
              </h1>
              <p className="text-blue-100 text-lg sm:text-xl max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
                Track your contributions, attendance, and council finances in
                real-time. Transparency for a stronger student community.
              </p>
              <button
                onClick={onViewTransparency}
                className="glass-button px-6 py-3"
              >
                <Eye className="w-5 h-5" />
                <span>View Transparency Board</span>
              </button>
            </div>

            {/* Right Column - Search Card */}
            <div ref={cardRef} className="glass-card-strong p-6 sm:p-8">
              {/* Card accent bar */}
              <div
                className="h-1 w-16 rounded-full mb-5"
                style={{ background: "var(--dssc-gold)" }}
              />
              <h2
                className="font-display font-bold text-2xl mb-2"
                style={{ color: "var(--dssc-deep-navy)" }}
              >
                Find Your Records
              </h2>
              <p className="text-text-secondary mb-6 text-sm">
                Enter your name or student ID to view your contributions and
                attendance.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "var(--dssc-deep-navy)" }}
                  >
                    Student Name
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => {
                      if (studentMatches.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowSuggestions(false), 150);
                    }}
                    className="glass-input w-full px-4 py-3"
                    placeholder="e.g., Juan Dela Cruz"
                    disabled={searching}
                    autoComplete="off"
                  />

                  {showSuggestions && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50">
                      <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                        {searchLoading && (
                          <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Searching students...
                          </div>
                        )}

                        {!searchLoading && studentMatches.length > 0 && (
                          <div>
                            {studentMatches.map((student) => (
                              <button
                                key={student.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();

                                  setName(student.name);
                                  setStudentId(student.studentId);
                                  setShowSuggestions(false);
                                  setStudentMatches([]);

                                  onSearch(student.name, student.studentId);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-100"
                              >
                                <div className="font-semibold text-gray-900">
                                  {student.name}
                                </div>

                                <div className="text-sm text-gray-500 mt-0.5">
                                  ID: {student.studentId}
                                  {" • "}
                                  {student.program}
                                  {" • "}
                                  {student.yearLevel}
                                  {student.section && ` • ${student.section}`}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {!searchLoading &&
                          studentMatches.length === 0 &&
                          name.trim() && (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              No students found.
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-silver-gray/30"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-white text-xs text-text-secondary rounded-full">
                      OR
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "var(--dssc-deep-navy)" }}
                  >
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
                  className="w-full btn-primary px-6 py-3 justify-center"
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
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ color: "rgba(255,255,255,0.60)" }}
        >
          <span className="text-xs tracking-widest uppercase">Scroll down</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </div>
      </section>
      <section
        id="lsc-preview"
        className="relative overflow-hidden bg-[#0E1A4D] px-4 py-20 sm:px-6 lg:px-8"
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(58,95,224,0.32),transparent_62%)]" />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <div className="mb-10 text-center">
            <span className="dssc-tagline">
              Leadership • Service • Commitment
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
              LSC Preview
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-blue-100 sm:text-base">
              Meet the officers dedicated to serving the Local Student Council
              community.
            </p>
          </div>
          <LSCOfficerCarousel />
        </div>
      </section>
    </>
  );
}
