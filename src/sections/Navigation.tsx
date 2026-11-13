import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogIn, LogOut, Menu as MenuIcon, Moon, Sun, X } from "lucide-react";
import type { UserRole, ViewState } from "@/types";
import { ROLE_LABEL, VIEW_ROLES } from "@/lib/roles";
import { liquidGlass } from "@/lib/liquidGlass";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import NotificationBell from "@/components/NotificationBell";

interface NavigationProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  role: UserRole | null;
  onLogout: () => void;
  /** Set once a visitor has verified name + Student ID via the landing search. */
  studentId?: string;
}

type Link = { label: string; view: ViewState; roles?: UserRole[] };

const PUBLIC_LINKS: Link[] = [
  { label: "Records", view: "landing" },
  { label: "Transparency", view: "transparency" },
  { label: "Feedback", view: "inquiry" },
];

// Staff links are filtered by VIEW_ROLES unless they list their own roles.
const STAFF_LINKS: Link[] = [
  { label: "Students", view: "student-management" },
  { label: "Transparency", view: "transparency", roles: ["board-member"] },
  { label: "Feedback", view: "feedback-management" },
];
const MANAGE_LINKS: Link[] = [
  { label: "Events", view: "event-management" },
  { label: "Attendance", view: "attendance-management" },
  { label: "Contributions", view: "contribution-management" },
  { label: "Finances", view: "transaction-management" },
  { label: "Reports", view: "report-management" },
  { label: "Council Sharing Files", view: "requirement-files-management" },
  { label: "Officers & Volunteers", view: "officer-volunteers-management" },
  { label: "System Logs", view: "system-logs" },
];

const allowed = (role: UserRole) => (l: Link) => (l.roles ?? VIEW_ROLES[l.view] ?? [role]).includes(role);

export default function Navigation({ currentView, onNavigate, role, onLogout, studentId }: NavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const barRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Like iOS glass, the bar takes the tone of what is behind it: light over a light surface, else dark.
  const [tone, setTone] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const sample = () => {
      const bar = barRef.current;
      if (!bar) return;
      const r = bar.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const overLight = [0.2, 0.5, 0.8].filter((f) => {
        const under = document.elementsFromPoint(r.left + r.width * f, y).find((el) => !bar.contains(el) && !(el as HTMLElement).closest("nav"));
        return under?.closest(".card, .bg-surface") && document.documentElement.dataset.theme !== "dark";
      }).length;
      setTone(overLight >= 2 ? "light" : "dark");
    };
    sample();
    window.addEventListener("scroll", sample, { passive: true });
    window.addEventListener("resize", sample);
    const observer = new MutationObserver(sample);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("scroll", sample);
      window.removeEventListener("resize", sample);
      observer.disconnect();
    };
  }, [currentView]);

  // Lens refraction at the rim (Convx nav physics: strong lens, 3px blur, 2x saturation).
  useEffect(() => (barRef.current ? liquidGlass(barRef.current, { scale: -90, chroma: 4, blur: 3, saturate: 2, border: 0.12, mapBlur: 10 }) : undefined), []);
  useEffect(() => (mobileOpen && sheetRef.current ? liquidGlass(sheetRef.current, { scale: -60, chroma: 3, blur: 12, saturate: 1.8 }) : undefined), [mobileOpen]);

  const links = role ? STAFF_LINKS.filter(allowed(role)) : PUBLIC_LINKS;
  const manage = role ? MANAGE_LINKS.filter(allowed(role)) : [];
  const manageActive = manage.some((l) => l.view === currentView);

  const go = (view: ViewState) => {
    setMobileOpen(false);
    onNavigate(view);
  };
  const logout = () => {
    setMobileOpen(false);
    onLogout();
  };

  const iconBtn = "btn btn-icon nav-ctl";
  const pillLink = (active: boolean) =>
    cn(
      "btn btn-sm h-9 px-4",
      active ? "nav-active" : "nav-ctl",
    );
  const sheetLink = (active: boolean) =>
    cn("w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition", active ? "nav-active" : "nav-ctl");

  return (
    <nav className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4">
      <div ref={barRef} data-tone={mobileOpen ? "dark" : tone} className="glass-chrome mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-full pl-2.5 pr-2 lg:h-16 lg:pl-3">
        <button onClick={() => go("landing")} className="flex items-center gap-2.5" aria-label="LSynC home">
          <img src="/lsc-logo.jpg" alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30" />
          <span className="text-lg font-extrabold tracking-tight">
            LSyn<span className="text-brand-400">C</span>
          </span>
        </button>

        {/* Desktop: centered pill nav */}
        <div className="flex flex-1 justify-center">
          <div className="nav-track hidden items-center gap-1 rounded-full p-1 lg:flex">
            {links.map((l) => (
              <button key={l.view} onClick={() => go(l.view)} className={pillLink(currentView === l.view)}>
                {l.label}
              </button>
            ))}
            {manage.length > 0 && (
              <Menu>
                <MenuTrigger asChild>
                  <button className={pillLink(manageActive)}>
                    Manage <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </MenuTrigger>
                <MenuContent align="center" sideOffset={10} className="w-56">
                  {manage.map((l) => (
                    <MenuItem key={l.view} onSelect={() => go(l.view)} className={cn(currentView === l.view && "text-brand-600")}>
                      {l.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className={iconBtn} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <NotificationBell onNavigate={go} isLoggedIn={!!role} studentId={studentId} triggerClassName={iconBtn} />

          <div className="ml-2 hidden items-center gap-2 lg:flex">
            {role ? (
              <>
                <button onClick={() => go("admin-dashboard")} className="btn btn-primary btn-sm h-9" title={`Signed in as ${ROLE_LABEL[role]}`}>
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </button>
                <button onClick={logout} className={iconBtn} aria-label="Log out" title="Log out">
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </>
            ) : (
              <button onClick={() => go("admin-login")} className="btn btn-primary btn-sm h-9">
                <LogIn className="h-4 w-4" /> Log in
              </button>
            )}
          </div>

          <button onClick={() => setMobileOpen((o) => !o)} className={cn(iconBtn, "lg:hidden")} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile: card sheet */}
      {mobileOpen && (
        <div ref={sheetRef} data-tone="dark" className="glass-chrome mx-auto mt-2 max-h-[calc(100dvh-6rem)] max-w-6xl animate-fade-up overflow-y-auto rounded-3xl p-2 lg:hidden">
          {role && <p className="px-4 pb-1 pt-2 text-xs font-semibold text-muted">Signed in as {ROLE_LABEL[role]}</p>}
          {role && (
            <button onClick={() => go("admin-dashboard")} className={sheetLink(currentView === "admin-dashboard")}>
              Dashboard
            </button>
          )}
          {links.map((l) => (
            <button key={l.view} onClick={() => go(l.view)} className={sheetLink(currentView === l.view)}>
              {l.label}
            </button>
          ))}
          {manage.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Manage</p>
              {manage.map((l) => (
                <button key={l.view} onClick={() => go(l.view)} className={sheetLink(currentView === l.view)}>
                  {l.label}
                </button>
              ))}
            </>
          )}
          <div className="mt-2 border-t border-line p-2">
            {role ? (
              <button onClick={logout} className="btn btn-secondary w-full">
                <LogOut className="h-4 w-4" /> Log out
              </button>
            ) : (
              <button onClick={() => go("admin-login")} className="btn btn-primary w-full">
                <LogIn className="h-4 w-4" /> Log in
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
