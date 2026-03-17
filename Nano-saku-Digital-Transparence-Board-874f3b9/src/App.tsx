import { useState, useRef } from 'react';
import type { ViewState, Student } from '@/types';
import { getStudentById, getStudentByName } from '@/data/store';

// Sections
import Navigation from '@/sections/Navigation';
import LandingSection from '@/sections/LandingSection';
import StudentRecordSection from '@/sections/StudentRecordSection';
import TransparencyBoardSection from '@/sections/TransparencyBoardSection';
import FeedbackSection from '@/sections/FeedbackSection';
import AdminLoginSection from '@/sections/AdminLoginSection';
import AdminDashboardSection from '@/sections/AdminDashboardSection';
import StudentManagementSection from '@/sections/StudentManagementSection';
import EventManagementSection from '@/sections/EventManagementSection';
import FooterSection from '@/sections/FooterSection';

function App() {
  const [currentView, setCurrentView] = useState<ViewState>('landing');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const mainRef = useRef<HTMLDivElement>(null);

  // Handle student search
  const handleSearch = (name: string, studentId: string) => {
    let student: Student | undefined;
    
    if (studentId) {
      student = getStudentById(studentId);
    }
    
    if (!student && name) {
      student = getStudentByName(name);
    }
    
    if (student) {
      setSelectedStudent(student);
      setCurrentView('student-record');
    } else {
      alert('Student not found. Please try again.');
    }
  };

  // Handle admin login
  const handleAdminLogin = (username: string, password: string) => {
    // Simple mock authentication
    if ((username === 'admin' && password === 'admin') || 
        (username === 'superadmin' && password === 'superadmin')) {
      setIsAdmin(true);
      setCurrentView('admin-dashboard');
    } else {
      alert('Invalid credentials. Please try again.');
    }
  };

  // Handle navigation
  const navigateTo = (view: ViewState) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset admin state on logout
  const handleLogout = () => {
    setIsAdmin(false);
    setCurrentView('landing');
  };

  // Render current view
  const renderView = () => {
    switch (currentView) {
      case 'landing':
        return (
          <LandingSection 
            onSearch={handleSearch} 
            onViewTransparency={() => navigateTo('transparency')}
          />
        );
      
      case 'student-record':
        return selectedStudent && (
          <StudentRecordSection 
            student={selectedStudent}
            onBack={() => navigateTo('landing')}
          />
        );
      
      case 'transparency':
        return <TransparencyBoardSection onNavigate={navigateTo} />;
      
      case 'inquiry':
      case 'complaint':
      case 'suggestion':
        return <FeedbackSection defaultTab={currentView} />;
      
      case 'admin-login':
        return <AdminLoginSection onLogin={handleAdminLogin} />;
      
      case 'admin-dashboard':
        return isAdmin ? (
          <AdminDashboardSection 
            onNavigate={navigateTo}
            onLogout={handleLogout}
          />
        ) : (
          <AdminLoginSection onLogin={handleAdminLogin} />
        );
      
      case 'student-management':
        return isAdmin ? (
          <StudentManagementSection onBack={() => navigateTo('admin-dashboard')} />
        ) : (
          <AdminLoginSection onLogin={handleAdminLogin} />
        );
      
      case 'event-management':
      case 'payment-management':
      case 'attendance-management':
        return isAdmin ? (
          <EventManagementSection 
            onBack={() => navigateTo('admin-dashboard')} 
            initialTab={currentView}
          />
        ) : (
          <AdminLoginSection onLogin={handleAdminLogin} />
        );
      
      case 'transaction-management':
        return isAdmin ? (
          <TransparencyBoardSection adminMode onBack={() => navigateTo('admin-dashboard')} />
        ) : (
          <AdminLoginSection onLogin={handleAdminLogin} />
        );
      
      default:
        return <LandingSection onSearch={handleSearch} onViewTransparency={() => navigateTo('transparency')} />;
    }
  };

  return (
    <div ref={mainRef} className="min-h-screen">
      {/* Navigation */}
      <Navigation 
        currentView={currentView}
        onNavigate={navigateTo}
        isAdmin={isAdmin}
      />
      
      {/* Main Content */}
      <main className="relative">
        {renderView()}
      </main>
      
      {/* Footer - only show on landing page */}
      {currentView === 'landing' && (
        <FooterSection onNavigate={navigateTo} />
      )}
    </div>
  );
}

export default App;
