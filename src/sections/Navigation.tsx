import { useState, useEffect } from 'react';
import { Menu, X, Shield } from 'lucide-react';
import type { ViewState } from '@/types';

interface NavigationProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  isAdmin: boolean;
}

export default function Navigation({ currentView, onNavigate, isAdmin }: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isPublicPage = !isAdmin && 
    currentView !== 'admin-login' && 
    currentView !== 'admin-dashboard' && 
    currentView !== 'student-management' && 
    currentView !== 'event-management' && 
    currentView !== 'payment-management' && 
    currentView !== 'attendance-management' && 
    currentView !== 'transaction-management';

  const publicNavItems = [
    { label: 'Records', view: 'landing' as ViewState },
    { label: 'Transparency', view: 'transparency' as ViewState },
    { label: 'Inquiry', view: 'inquiry' as ViewState },
  ];

  const adminNavItems = [
    { label: 'Dashboard', view: 'admin-dashboard' as ViewState },
    { label: 'Students', view: 'student-management' as ViewState },
    { label: 'Events', view: 'event-management' as ViewState },
    { label: 'Transparency', view: 'transaction-management' as ViewState },
  ];

  const navItems = isAdmin ? adminNavItems : publicNavItems;

  if (!isPublicPage && !isAdmin) {
    return null;
  }

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/70 backdrop-blur-lg shadow-sm' 
          : 'bg-transparent'
      }`}
    >
      <div className="w-full px-6 lg:px-12">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <button 
            onClick={() => onNavigate(isAdmin ? 'admin-dashboard' : 'landing')}
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 rounded-lg bg-red flex items-center justify-center">
              <span className="text-white font-display font-bold text-sm">SB</span>
            </div>
            <span className="font-display font-semibold text-dark text-lg group-hover:text-red transition-colors">
              StudentBoard
            </span>
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => onNavigate(item.view)}
                className={`nav-link text-sm font-medium ${
                  currentView === item.view ? 'active text-red' : ''
                }`}
              >
                {item.label}
              </button>
            ))}
            
            {/* Admin Access Link */}
            {!isAdmin && (
              <button
                onClick={() => onNavigate('admin-login')}
                className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-red transition-colors"
              >
                <Shield className="w-4 h-4" />
                <span>Admin</span>
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-white/50 transition-colors"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5 text-dark" />
            ) : (
              <Menu className="w-5 h-5 text-dark" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden glass-card mx-4 mb-4 p-4">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  onNavigate(item.view);
                  setIsMobileMenuOpen(false);
                }}
                className={`px-4 py-3 rounded-xl text-left font-medium transition-colors ${
                  currentView === item.view 
                    ? 'bg-red/10 text-red' 
                    : 'hover:bg-white/50 text-dark'
                }`}
              >
                {item.label}
              </button>
            ))}
            
            {!isAdmin && (
              <button
                onClick={() => {
                  onNavigate('admin-login');
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-left font-medium text-text-secondary hover:bg-white/50 transition-colors"
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
