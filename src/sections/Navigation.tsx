import { useState, useEffect } from "react";
import { Menu, X, Shield } from "lucide-react";
import type { ViewState, UserRole } from "@/types";
interface NavigationProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  role: UserRole | null;
}

type NavItem = {
  label: string;
  view: ViewState;
};

type ManagementNavItem = {
  label: string;
  view: ViewState;
};

const PUBLIC_NAV_ITEMS: NavItem[] = [
  { label: "Records", view: "landing" },
  { label: "Transparency", view: "transparency" },
  { label: "Inquiry", view: "inquiry" },
];

// Nav items are filtered by the officer's role.
function buildAdminNavItems(role: UserRole | null): {
  main: NavItem[];
  management: ManagementNavItem[];
} {
  const management: ManagementNavItem[] = [
    ...(role
      ? [{ label: "Events", view: "event-management" as ViewState }]
      : []),

    ...(role === "secretary"
      ? [{ label: "Attendance", view: "attendance-management" as ViewState }]
      : []),

    ...(role === "admin" || role === "treasurer" || role === "auditor"
      ? [{ label: "Payments", view: "payment-management" as ViewState }]
      : []),

    ...(role === "admin" || role === "treasurer" || role === "auditor"
      ? [
          {
            label: "Contributions",
            view: "contribution-management" as ViewState,
          },
        ]
      : []),

    ...(role === "admin" || role === "treasurer" || role === "auditor"
      ? [
          {
            label: "Finances",
            view: "transaction-management" as ViewState,
          },
        ]
      : []),
  ];

  const main: NavItem[] = [
    { label: "Dashboard", view: "admin-dashboard" },

    ...(role === "admin" || role === "secretary"
      ? [{ label: "Students", view: "student-management" as ViewState }]
      : []),

    ...(role === "board-member"
      ? [{ label: "Transparency", view: "transparency" as ViewState }]
      : []),

    { label: "Feedback", view: "feedback-management" },
  ];

  return {
    main,
    management,
  };
}

export default function Navigation({
  currentView,
  onNavigate,
  role,
}: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  const isLoggedIn = !!role;
  const adminViews: ViewState[] = [
    "admin-dashboard",
    "student-management",
    "event-management",
    "payment-management",
    "contribution-management",
    "attendance-management",
    "transaction-management",
    "feedback-management",
  ];
  const isPublicPage = !isLoggedIn && !adminViews.includes(currentView);

  const adminNav = isLoggedIn
    ? buildAdminNavItems(role)
    : { main: [], management: [] };

  const navItems = isLoggedIn ? adminNav.main : PUBLIC_NAV_ITEMS;
  const managementItems = isLoggedIn ? adminNav.management : [];

  const isManagementView = managementItems.some(
    (item) => item.view === currentView,
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  if (!isPublicPage && !isLoggedIn) {
    return null;
  }

  const go = (view: ViewState) => {
    onNavigate(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-deep-navy/95 backdrop-blur-lg shadow-lg"
          : "bg-deep-navy"
      }`}
      style={{ borderBottom: "1px solid rgba(201,163,78,0.25)" }}
    >
      <div className="w-full px-6 lg:px-12">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <button
            onClick={() => go(isLoggedIn ? "admin-dashboard" : "landing")}
            className="flex items-center gap-3 group p-0"
          >
            <img
              src="/lsc-logo.jpg"
              alt="Local Student Council logo"
              className="w-9 h-9 rounded-lg object-cover ring-2 ring-lsc-gold/40"
            />
            <div className="flex flex-col leading-tight">
              <span className="font-display font-bold text-white text-base tracking-wide group-hover:text-lsc-gold transition-colors">
                DSSC — LSC
              </span>
              <span className="text-silver-gray text-[0.65rem] tracking-widest uppercase">
                Santa Cruz
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.view)}
                className={`nav-link text-sm font-medium ${
                  currentView === item.view ? "active" : ""
                }`}
              >
                {item.label}
              </button>
            ))}

            {/* Management Dropdown */}
            {isLoggedIn && managementItems.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsManagementOpen((prev) => !prev)}
                  className={`nav-link text-sm font-medium flex items-center gap-1 ${
                    isManagementView ? "active" : ""
                  }`}
                >
                  <span>Management</span>
                  <span
                    className={`text-xs transition-transform duration-200 ${
                      isManagementOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {isManagementOpen && (
                  <div
                    className="absolute top-full right-0 mt-3 w-52 rounded-xl overflow-hidden shadow-xl"
                    style={{
                      background: "rgba(14,26,77,0.98)",
                      border: "1px solid rgba(201,163,78,0.20)",
                      backdropFilter: "blur(16px)",
                    }}
                  >
                    <div className="p-2">
                      {managementItems.map((item) => (
                        <button
                          key={item.label}
                          onClick={() => {
                            go(item.view);
                            setIsManagementOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                            currentView === item.view
                              ? "bg-royal-blue/40 text-lsc-gold"
                              : "text-white/80 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Admin Access Link */}
            {!isLoggedIn && (
              <button
                onClick={() => go("admin-login")}
                className="flex items-center gap-1.5 text-sm text-silver-gray hover:text-lsc-gold transition-colors"
              >
                <Shield className="w-4 h-4" />
                <span>Admin</span>
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-white hover:text-lsc-gold transition-colors"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden mx-4 mb-4 rounded-xl overflow-hidden"
          style={{
            background: "rgba(14,26,77,0.97)",
            border: "1px solid rgba(201,163,78,0.20)",
          }}
        >
          <div className="flex flex-col gap-1 p-3">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => go(item.view)}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium text-sm transition-colors ${
                  currentView === item.view
                    ? "bg-royal-blue/40 text-lsc-gold"
                    : "text-white/80 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </button>
            ))}
            {isLoggedIn && managementItems.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setIsManagementOpen((prev) => !prev)}
                  className={`w-full text-left px-4 py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-between ${
                    isManagementView
                      ? "bg-royal-blue/40 text-lsc-gold"
                      : "text-white/80 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>Management</span>
                  <span
                    className={`transition-transform duration-200 ${
                      isManagementOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {isManagementOpen && (
                  <div className="ml-3 mt-1 space-y-1 border-l border-white/10 pl-2">
                    {managementItems.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => {
                          go(item.view);
                          setIsManagementOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                          currentView === item.view
                            ? "bg-royal-blue/30 text-lsc-gold"
                            : "text-white/70 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isLoggedIn && (
              <button
                onClick={() => go("admin-login")}
                className="w-full text-left px-4 py-3 rounded-lg font-medium text-sm text-silver-gray hover:text-lsc-gold transition-colors flex items-center gap-2"
              >
                <Shield className="w-4 h-4" />
                <span>Admin Access</span>
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
