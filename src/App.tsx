import { useState, useEffect, useRef, Suspense, lazy } from "react";
import type { ViewState, Student, UserRole } from "@/types";
import { studentsService } from "@/services/db";
import { authService, type AuthSession } from "@/services/auth";
import { toast, Toaster } from "sonner";
import { offlineSyncService } from "@/lib/offlineSync";
import SyncStatusBadge from "@/components/SyncStatusBadge";

// Public-facing sections load eagerly — most visitors land here first.
import Navigation from "@/sections/Navigation";
import LandingSection from "@/sections/LandingSection";
import StudentRecordSection from "@/sections/StudentRecordSection";
import TransparencyBoardSection from "@/sections/TransparencyBoardSection";
import FeedbackSection from "@/sections/FeedbackSection";
import FooterSection from "@/sections/FooterSection";

// Admin-only sections — lazy-loaded behind the login wall so the public
// landing page isn't paying for code most visitors never touch.
const AdminLoginSection = lazy(() => import("@/sections/AdminLoginSection"));
const ForgotPasswordSection = lazy(
  () => import("@/sections/ForgotPasswordSection"),
);
const ResetPasswordSection = lazy(
  () => import("@/sections/ResetPasswordSection"),
);
const AdminDashboardSection = lazy(
  () => import("@/sections/AdminDashboardSection"),
);
const StudentManagementSection = lazy(
  () => import("@/sections/StudentManagementSection"),
);
const EventManagementSection = lazy(
  () => import("@/sections/EventManagementSection"),
);
const ContributionManagementSection = lazy(
  () => import("@/sections/ContributionManagementSection"),
);
const FeedbackManagementSection = lazy(
  () => import("@/sections/FeedbackManagementSection"),
);

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  secretary: "Secretary",
  treasurer: "Treasurer",
  auditor: "Auditor",
  "board-member": "Board Member",
};
const SectionFallback = () => (
  <section className="min-h-screen w-full gradient-bg-warm flex items-center justify-center">
    <div className="text-center">
      <div className="w-10 h-10 border-4 border-red/20 border-t-red rounded-full animate-spin mx-auto mb-4" />
      <p className="text-text-secondary">Loading...</p>
    </div>
  </section>
);
function App() {
  const [currentView, setCurrentView] = useState<ViewState>("landing");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [searching, setSearching] = useState(false);

  const mainRef = useRef<HTMLDivElement>(null);

  // Start / stop the connectivity listeners for the offline sync service.
  useEffect(() => {
    offlineSyncService.start();
    return () => offlineSyncService.stop();
  }, []);

  // Keep the offline sync service in sync with the authenticated officer session.
  useEffect(() => {
    offlineSyncService.configure(auth?.user.id ?? null, auth?.role ?? null);
  }, [auth]);

  // Restore the persisted Supabase session after a reload.
  useEffect(() => {
    authService
      .restoreSession()
      .then((session) => {
        setAuth(session);
        setCurrentView((prev) =>
          session && prev === "admin-login" ? "admin-dashboard" : prev,
        );
      })
      .catch((error) => console.error("Failed to restore session:", error))
      .finally(() => setAuthReady(true));
  }, []);

  // Listen for Supabase's PASSWORD_RECOVERY event, fired once when the user
  // lands here via a password-reset email link (see authService.requestPasswordReset).
  useEffect(() => {
    const unsubscribe = authService.onPasswordRecovery(() => {
      setAuth(null);
      setCurrentView("admin-reset-password");
    });

    return unsubscribe;
  }, []);

  const role: UserRole | null = auth?.role ?? null;

  // Handle student search - now using database
  const handleSearch = async (name: string, studentId: string) => {
    try {
      setSearching(true);
      let student: Student | null = null;

      if (studentId) {
        student = await studentsService.getByStudentId(studentId);
      }

      if (!student && name) {
        student = await studentsService.getByName(name);
      }

      // Fall back to a fuzzy search across both fields so partial IDs and
      // abbreviations still resolve (e.g. "2021-000", "Maria", "Dela").
      if (!student && (name || studentId)) {
        const matches = await studentsService.search(
          `${name} ${studentId}`.trim(),
        );
        student = matches[0] ?? null;
      }

      if (student) {
        setSelectedStudent(student);
        setCurrentView("student-record");
      } else {
        toast.error("Student not found. Please try again.");
      }
    } catch (error) {
      console.error("Error searching student:", error);
      toast.error("Error searching for student. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  // Handle admin/staff login. Throws so the login form can surface errors.
  const handleLogin = async (email: string, password: string) => {
    const session = await authService.signIn(email, password);
    setAuth(session);
    setCurrentView("admin-dashboard");
    toast.success(`Welcome, ${ROLE_LABEL[session.role]}!`);
  };

  // Send a password-reset email for the "forgot password" flow.
  const handleRequestPasswordReset = async (email: string) => {
    await authService.requestPasswordReset(email);
  };

  // Finish the "forgot password" flow: set the new password, then sign the
  // recovery session out so the officer re-authenticates normally.
  const handleSetNewPassword = async (newPassword: string) => {
    const hasSession = await authService.hasRecoverySession();

    if (!hasSession) {
      throw new Error(
        "Your password reset session is no longer valid. Please request a new reset link.",
      );
    }

    await authService.updatePassword(newPassword);

    await authService.signOut();

    setAuth(null);
    setCurrentView("admin-login");

    toast.success(
      "Password updated successfully. Please sign in with your new password.",
    );
  };

  // Handle navigation
  const navigateTo = (view: ViewState) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset admin state on logout
  const handleLogout = async () => {
    try {
      await authService.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
    setAuth(null);
    offlineSyncService.configure(null, null);
    setCurrentView("landing");
    toast.info("You have been logged out");
  };

  // Which admin views each role may open.
  const canAccess = (view: ViewState): boolean => {
    if (!role) return false;
    switch (view) {
      case "student-management":
        return role === "admin" || role === "secretary";
      case "contribution-management":
        return role === "admin" || role === "treasurer" || role === "auditor";
      case "payment-management":
      case "transaction-management":
        return role === "admin" || role === "treasurer" || role === "auditor";
      case "attendance-management":
        return role === "admin" || role === "secretary";
      case "event-management":
        return true; // any staff member may view the event schedule
      case "feedback-management":
      case "admin-dashboard":
        return true;
      default:
        return true;
    }
  };

  // Render current view
  const renderView = () => {
    if (!authReady) {
      return (
        <section className="min-h-screen w-full gradient-bg-warm flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-red/20 border-t-red rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-secondary">Loading...</p>
          </div>
        </section>
      );
    }

    const renderAdminLogin = () => (
      <AdminLoginSection
        onLogin={handleLogin}
        onForgotPassword={() => navigateTo("admin-forgot-password")}
      />
    );
    const renderDashboard = () => (
      <AdminDashboardSection
        role={role!}
        userEmail={auth?.user.email ?? ""}
        userId={auth?.user.id ?? ""}
        onNavigate={navigateTo}
        onLogout={handleLogout}
      />
    );

    switch (currentView) {
      case "landing":
        return (
          <LandingSection
            onSearch={handleSearch}
            onViewTransparency={() => navigateTo("transparency")}
            searching={searching}
          />
        );

      case "student-record":
        return (
          selectedStudent && (
            <StudentRecordSection
              student={selectedStudent}
              onBack={() => navigateTo("landing")}
            />
          )
        );

      case "transparency":
        return <TransparencyBoardSection onNavigate={navigateTo} />;

      case "inquiry":
      case "complaint":
      case "suggestion":
        return <FeedbackSection defaultTab={currentView} />;

      case "admin-login":
        return auth ? renderDashboard() : renderAdminLogin();

      case "admin-forgot-password":
        return (
          <ForgotPasswordSection
            onRequestReset={handleRequestPasswordReset}
            onBack={() => navigateTo("admin-login")}
          />
        );

      case "admin-reset-password":
        return <ResetPasswordSection onSetNewPassword={handleSetNewPassword} />;

      case "admin-dashboard":
        return auth ? renderDashboard() : renderAdminLogin();

      case "student-management":
        return canAccess("student-management") ? (
          <StudentManagementSection
            onBack={() => navigateTo("admin-dashboard")}
          />
        ) : (
          renderAdminLogin()
        );

      case "event-management":
      case "payment-management":
        return canAccess(currentView) ? (
          <EventManagementSection
            role={role!}
            staffName={auth?.displayName ?? ""}
            userId={auth?.user.id ?? ""}
            onBack={() => navigateTo("admin-dashboard")}
            initialTab={currentView}
          />
        ) : (
          renderAdminLogin()
        );

      case "attendance-management":
        return canAccess("attendance-management") ? (
          <EventManagementSection
            role={role!}
            staffName={auth?.displayName ?? ""}
            userId={auth?.user.id ?? ""}
            onBack={() => navigateTo("admin-dashboard")}
            initialTab="attendance-management"
          />
        ) : (
          renderAdminLogin()
        );

      case "contribution-management":
        return canAccess("contribution-management") ? (
          <ContributionManagementSection
            onBack={() => navigateTo("admin-dashboard")}
          />
        ) : (
          renderAdminLogin()
        );

      case "transaction-management":
        return canAccess(currentView) ? (
          <TransparencyBoardSection
            adminMode
            role={role!}
            staffName={auth?.displayName ?? ""}
            onBack={() => navigateTo("admin-dashboard")}
          />
        ) : (
          renderAdminLogin()
        );

      case "feedback-management":
        return canAccess(currentView) ? (
          <FeedbackManagementSection
            role={role!}
            onBack={() => navigateTo("admin-dashboard")}
          />
        ) : (
          renderAdminLogin()
        );

      default:
        return (
          <LandingSection
            onSearch={handleSearch}
            onViewTransparency={() => navigateTo("transparency")}
            searching={searching}
          />
        );
    }
  };

  return (
    <div ref={mainRef} className="min-h-screen">
      {/* Toast notifications */}
      <Toaster position="top-center" richColors />
      <SyncStatusBadge />
      {/* Navigation */}
      <Navigation
        currentView={currentView}
        onNavigate={navigateTo}
        role={auth ? role : null}
      />
      {/* Main Content */}
      // after
      <main className="relative">
        <Suspense fallback={<SectionFallback />}>{renderView()}</Suspense>
      </main>
      {/* Footer - only show on landing page */}
      {currentView === "landing" && <FooterSection onNavigate={navigateTo} />}
    </div>
  );
}

export default App;
