import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, CalendarCheck, Eye, FileCheck2, Loader2, ReceiptText, ShieldCheck, UserRound, Wallet } from "lucide-react";
import type { Student } from "@/types";
import { studentsService } from "@/services/db";
import { cn } from "@/lib/utils";
import LSCOfficerCarousel from "@/components/LSCOfficerCarousel";
import CouncilUpdates from "@/components/CouncilUpdates";
import UpcomingEvents from "@/components/UpcomingEvents";
import SplitText from "@/components/motion/SplitText";
import Reveal from "@/components/motion/Reveal";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

interface LandingSectionProps {
  onSearch: (name: string, studentId: string) => void;
  onViewTransparency: () => void;
  searching?: boolean;
}

export default function LandingSection({ onSearch, onViewTransparency, searching = false }: LandingSectionProps) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [matches, setMatches] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const picked = useRef(""); // name chosen from the list — don't search it again
  const nameRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  // Hero choreography: intro elements rise after the headline, preview cards
  // fly in, then drift upward (parallax) as the hero scrolls away.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".hero-intro", { y: 12, opacity: 0, stagger: 0.06, delay: 0.3, duration: 0.5, ease: "power2.out", clearProps: "transform" });
      gsap.from(".hero-card", { y: 40, opacity: 0, stagger: 0.08, delay: 0.5, duration: 0.7, ease: "power3.out" });
      gsap.to(".hero-cards", { yPercent: -30, ease: "none", scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: true } });
    },
    { scope: heroRef },
  );

  // Debounced name autocomplete; `stale` drops responses for older keystrokes.
  useEffect(() => {
    const q = name.trim();
    if (!q || q === picked.current) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const found = await studentsService.search(q);
        if (!stale) setMatches(found.slice(0, 8));
      } catch (error) {
        console.error("Student search failed:", error);
        if (!stale) setMatches([]);
      } finally {
        if (!stale) setLoading(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [name]);

  const changeName = (value: string) => {
    picked.current = "";
    setName(value);
    setOpen(!!value.trim());
    setLoading(!!value.trim());
    if (!value.trim()) setMatches([]);
  };

  const pick = (s: Student) => {
    picked.current = s.name;
    setName(s.name);
    setOpen(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!searching) onSearch(name, studentId);
  };

  const focusLookup = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    nameRef.current?.focus({ preventScroll: true });
  };

  const features = [
    { icon: UserRound, title: "Your personal record", text: "Contributions, payments and requirements — verified with just your name and ID.", action: focusLookup },
    { icon: Wallet, title: "Open council finances", text: "Every peso collected and spent, published for all students to see.", action: onViewTransparency },
    { icon: ReceiptText, title: "Verified receipts", text: "Official receipts and reports attached to each transaction.", action: onViewTransparency },
    { icon: CalendarCheck, title: "Attendance history", text: "QR check-ins for every council event, recorded as they happen.", action: focusLookup },
  ];

  return (
    <>
      <section ref={heroRef} className="hero-bg band-bottom flex min-h-[100svh] flex-col items-center px-4 pb-14 pt-32 sm:px-6 lg:pt-40">
        <div className="mx-auto w-full max-w-4xl text-center">
          <span className="hero-intro eyebrow">
            <ShieldCheck className="h-3.5 w-3.5 text-powder" />
            <span className="sm:hidden">Transparency you can check</span>
            <span className="hidden sm:inline">LSC Student Digital Board · Transparency you can check</span>
          </span>
          <SplitText delay={0.1} className="mt-6 text-[2.5rem] font-extrabold leading-[1.05] text-white sm:text-6xl lg:text-7xl">
            Your Council Records,
            <br />
            Clear &amp; <span className="text-[#8ff4ff]">Transparent</span>
          </SplitText>
          <p className="hero-intro mx-auto mt-5 max-w-xl text-base text-white/90 sm:text-lg">
            Check your contributions and attendance, and see exactly how student funds are used — all in one place.
          </p>

          {/* Student lookup */}
          <form onSubmit={submit} className="hero-intro card mx-auto mt-10 grid max-w-3xl gap-1 p-2 text-left shadow-lift sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:rounded-full">
            <div className="relative">
              <Segment id="lookup-name" label="Student name">
                <input
                  ref={nameRef}
                  id="lookup-name"
                  value={name}
                  onChange={(e) => changeName(e.target.value)}
                  onFocus={() => setOpen(!!name.trim() && name !== picked.current)}
                  onBlur={() => setOpen(false)}
                  placeholder="e.g. Juan Dela Cruz"
                  disabled={searching}
                  autoComplete="off"
                  className="w-full bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted/70"
                />
              </Segment>
              {open && (
                <div className="card absolute inset-x-0 top-full z-20 mt-2 overflow-hidden p-1.5 shadow-lift">
                  {loading ? (
                    <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" /> Searching students…
                    </p>
                  ) : matches.length ? (
                    matches.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep focus so blur doesn't close before the pick
                          pick(s);
                        }}
                        className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-surface-2"
                      >
                        {s.name}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-muted">No students found.</p>
                  )}
                </div>
              )}
            </div>
            <Segment id="lookup-id" label="Student ID" divided>
              <input
                id="lookup-id"
                type="password"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="For verification"
                disabled={searching}
                autoComplete="off"
                className="w-full bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted/70"
              />
            </Segment>
            <button type="submit" disabled={searching} className="btn btn-primary btn-lg mt-1 sm:mt-0">
              {searching ? "Checking…" : "View My Record"}
              <span className="btn-orb">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}</span>
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            <button onClick={onViewTransparency} className="inline-flex items-center gap-2 py-2 font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline">
              <Eye className="h-4 w-4" /> View Transparency Board
            </button>
            <span className="text-white/75">Your Student ID is only used to verify it&apos;s you.</span>
          </div>
        </div>

        {/* Decorative preview cards */}
        <div aria-hidden className="hero-cards group mt-auto hidden w-full max-w-5xl grid-cols-3 items-end gap-6 pt-16 md:grid">
          <Floating tilt="-rotate-6" fan="group-hover:[translate:-36px_-10px] group-hover:[rotate:-5deg]">
            <div className="glass p-5">
              <p className="text-xs font-semibold text-white/80">Funds Collected</p>
              <p className="mt-1 text-2xl font-extrabold">₱48,250</p>
              <div className="mt-4 flex h-14 items-end gap-1.5">
                {[40, 65, 50, 85, 60, 95, 75].map((h, i) => (
                  <span key={i} className="flex-1 rounded-full bg-powder/80" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </Floating>
          <Floating tilt="rotate-0" fan="group-hover:[translate:0_-22px] group-hover:[scale:1.04]">
            <div className="card p-5 pb-16">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted">Attendance</p>
                <span className="chip chip-success">+4%</span>
              </div>
              <p className="mt-1 text-3xl font-extrabold text-ink">92%</p>
              <div className="mt-4 h-2 rounded-full bg-surface-2">
                <div className="h-full w-[92%] rounded-full bg-brand-500" />
              </div>
              <p className="mt-3 text-xs text-muted">Across 12 council events</p>
            </div>
          </Floating>
          <Floating tilt="rotate-6" fan="group-hover:[translate:36px_-10px] group-hover:[rotate:5deg]">
            <div className="glass space-y-3 p-5">
              <p className="text-xs font-semibold text-white/80">Receipts verified</p>
              {["Sports fest supplies", "Org fair booth", "Seminar snacks"].map((r) => (
                <p key={r} className="flex items-center gap-2 text-sm font-medium">
                  <BadgeCheck className="h-4 w-4 shrink-0 text-powder" /> {r}
                </p>
              ))}
            </div>
          </Floating>
        </div>
      </section>

      <UpcomingEvents />

      <CouncilUpdates />

      {/* Council officers */}
      <section className="bg-page px-4 pb-20 sm:px-6 lg:pb-28">
        <Reveal className="hero-bg mx-auto max-w-6xl rounded-4xl px-4 py-14 sm:px-8">
          <div className="mb-10 text-center">
            <span className="eyebrow">Leadership · Service · Commitment</span>
            <h2 className="mt-4 text-3xl font-extrabold text-white sm:text-4xl">Meet your council</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">The officers serving the Local Student Council community.</p>
          </div>
          <LSCOfficerCarousel />
        </Reveal>
      </section>

      {/* About: one interactive panel instead of four marketing cards. */}
      <section className="bg-page px-4 pb-24 sm:px-6 lg:pb-32">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center">
            <span className="eyebrow">
              <FileCheck2 className="h-3.5 w-3.5" /> Why LSynC
            </span>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">Everything about your council, in one honest place</h2>
          </Reveal>
          <Reveal>
            <FeatureExplorer features={features} />
          </Reveal>
        </div>
      </section>
    </>
  );
}

type Feature = { icon: typeof Wallet; title: string; text: string; action: () => void };

/** Tabs on the left (a scrolling pill row on phones); the chosen feature resolves in on the right. */
function FeatureExplorer({ features }: { features: Feature[] }) {
  const [active, setActive] = useState(0);
  const { icon: Icon, title, text, action } = features[active];
  return (
    <div className="card grid overflow-hidden p-2 md:grid-cols-[18rem_1fr]">
      <div role="tablist" aria-label="LSynC features" className="flex gap-1 overflow-x-auto p-1 md:flex-col">
        {features.map((f, i) => (
          <button
            key={f.title}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn("flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition", i === active ? "bg-white text-[#0a2a9c] shadow-soft" : "text-white/80 hover:bg-white/10")}
          >
            <f.icon className="h-4 w-4 shrink-0" />
            {f.title}
          </button>
        ))}
      </div>
      <div key={active} role="tabpanel" className="blur-in flex flex-col justify-center gap-5 p-6 sm:p-10">
        <span className="icon-tile h-14 w-14">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h3 className="text-2xl font-extrabold">{title}</h3>
          <p className="mt-2 max-w-lg text-muted">{text}</p>
        </div>
        <button onClick={action} className="btn btn-primary self-start">
          Open <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Segment({ id, label, divided, children }: { id: string; label: string; divided?: boolean; children: ReactNode }) {
  return (
    // The whole segment is the tap target, not just the input line.
    <label htmlFor={id} className={cn("block cursor-text rounded-2xl px-5 py-2.5 transition focus-within:bg-surface-2 sm:rounded-full", divided && "sm:rounded-none sm:border-l sm:border-line sm:focus-within:rounded-full")}>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-ink">{label}</span>
      {children}
    </label>
  );
}

/** A tilted preview card in the hero; the three fan apart (springy) when the stack is hovered. */
function Floating({ tilt, fan, children }: { tilt: string; fan: string; children: ReactNode }) {
  return (
    <div className={cn("hero-card", tilt)}>
      <div className={cn("transition-[translate,rotate,scale] duration-700 ease-[cubic-bezier(0.34,1.4,0.64,1)]", fan)}>{children}</div>
    </div>
  );
}
