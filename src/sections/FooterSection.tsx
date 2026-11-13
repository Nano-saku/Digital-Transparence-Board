import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, Facebook, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/Disclosure";
import { cn } from "@/lib/utils";
import { FACEBOOK_PAGE_URL } from "@/lib/constants";
import type { ViewState } from "@/types";

interface FooterSectionProps {
  onNavigate: (view: ViewState) => void;
}

const LINKS: [string, ViewState][] = [
  ["Search Record", "landing"],
  ["Transparency Board", "transparency"],
  ["Inquiry", "inquiry"],
  ["Complaint", "complaint"],
  ["Suggestion", "suggestion"],
  ["Officer Login", "admin-login"],
];

const CONTACT: { icon: typeof Mail; label: string; href?: string }[] = [
  { icon: Facebook, label: "facebook.com/dsscsclsc", href: FACEBOOK_PAGE_URL },
  { icon: Mail, label: "dsscsclsc@gmail.com", href: "mailto:dsscsclsc@gmail.com" },
  { icon: Phone, label: "No number yet" },
  { icon: MapPin, label: "Student Council Office, Likod Sa SB 101" },
];

const HOURS = [
  ["Monday – Friday", "8:00 AM – 5:00 PM"],
  ["Saturday – Sunday", "Closed"],
];

const DEVELOPERS = ["Mark Louise Eyas — Back-end", "Justine Renz Capapas — UI/UX Front-end", "John Mark Mahidlawon — DevOps"];

const DESKTOP = "(min-width: 768px)";
const useDesktop = () =>
  useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => matchMedia(DESKTOP).matches,
  );

/** A footer column: always open on desktop; a tap-to-expand group on phones. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const shown = desktop || open;
  return (
    <div className="border-b border-white/10 md:border-0">
      <button type="button" disabled={desktop} aria-expanded={shown} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-4 text-left text-sm font-bold text-white md:pointer-events-none md:pb-4 md:pt-0">
        {title}
        <ChevronDown className={cn("h-4 w-4 text-white/60 transition-[rotate] duration-500 md:hidden", shown && "[rotate:180deg]")} />
      </button>
      <Reveal open={shown}>
        <div className="pb-5 md:pb-0">{children}</div>
      </Reveal>
    </div>
  );
}

export default function FooterSection({ onNavigate }: FooterSectionProps) {
  return (
    <footer className="band-top bg-brand-950 px-4 pb-8 pt-16 text-sm text-white/60 sm:px-6">
      <div className="mx-auto grid max-w-6xl md:grid-cols-2 md:gap-10 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/lsc-logo.jpg" alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20" />
            <span className="text-lg font-extrabold text-white">
              LSyn<span className="text-brand-400">C</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs">Built for transparency. Designed for students.</p>
          <p className="mt-1 italic text-powder/80">“One Step Better Than Yesterday.”</p>
          <details className="group mt-5 text-xs md:mb-0 mb-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold uppercase tracking-wider text-white/50 hover:text-white/80">
              Developers <ChevronDown className="h-3.5 w-3.5 transition-[rotate] duration-300 group-open:[rotate:180deg]" />
            </summary>
            <ul className="mt-2 space-y-1">
              {DEVELOPERS.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        </div>

        <Group title="Quick links">
          <ul className="space-y-2.5">
            {LINKS.map(([label, view]) => (
              <li key={view}>
                <button onClick={() => onNavigate(view)} className="transition hover:text-white">
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </Group>

        <Group title="Contact us">
          <ul className="space-y-3">
            {CONTACT.map(({ icon: Icon, label, href }) => (
              <li key={label} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                {href ? (
                  <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="hover:text-white">
                    {label}
                  </a>
                ) : (
                  label
                )}
              </li>
            ))}
          </ul>
        </Group>

        <Group title="Office hours">
          <dl className="space-y-2">
            {HOURS.map(([days, time]) => (
              <div key={days} className="flex justify-between gap-4">
                <dt>{days}</dt>
                <dd className="font-semibold text-white">{time}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
            <ShieldCheck className="h-4 w-4 shrink-0 text-powder" />
            <span>
              <b className="text-white">Data privacy:</b> all data is handled in compliance with the Data Privacy Act of 2012 (RA 10173).
            </span>
          </p>
        </Group>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 pt-6 text-center text-xs sm:text-left">
        © {new Date().getFullYear()} Local Student Council · LSynC. All rights reserved.
      </div>
    </footer>
  );
}
