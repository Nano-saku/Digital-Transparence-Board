import { useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { 
  Plus, X, Search, Eye, MessageCircle, AlertTriangle, 
  Lightbulb, Shield, Home
} from 'lucide-react';
import type { ViewState } from '@/types';

interface FloatingQuickActionsProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  isAdmin: boolean;
}

export default function FloatingQuickActions({ currentView, onNavigate, isAdmin }: FloatingQuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Hide/show on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Show when scrolling up, hide when scrolling down
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.quick-actions-container')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  // Animate menu items when opening
  useEffect(() => {
    if (isOpen) {
      gsap.fromTo(
        '.quick-action-item',
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'back.out(1.7)' }
      );
    }
  }, [isOpen]);

  // Don't show on admin pages
  if (isAdmin || currentView === 'admin-login') {
    return null;
  }

  const quickLinks = [
    { label: 'Home', view: 'landing' as ViewState, icon: Home, color: 'bg-blue-500' },
    { label: 'Records', view: 'landing' as ViewState, icon: Search, color: 'bg-red' },
    { label: 'Transparency', view: 'transparency' as ViewState, icon: Eye, color: 'bg-green-500' },
    { label: 'Inquiry', view: 'inquiry' as ViewState, icon: MessageCircle, color: 'bg-purple-500' },
    { label: 'Complaint', view: 'complaint' as ViewState, icon: AlertTriangle, color: 'bg-orange-500' },
    { label: 'Suggestion', view: 'suggestion' as ViewState, icon: Lightbulb, color: 'bg-yellow-500' },
    { label: 'Admin', view: 'admin-login' as ViewState, icon: Shield, color: 'bg-gray-700' },
  ];

  const handleNavigate = (view: ViewState) => {
    onNavigate(view);
    setIsOpen(false);
  };

  return (
    <div 
      className={`quick-actions-container fixed bottom-6 right-6 z-50 transition-transform duration-300 ${
        isVisible ? 'translate-y-0' : 'translate-y-24'
      }`}
    >
      {/* Expanded Menu */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 flex flex-col items-end gap-3 mb-2">
          {quickLinks.map((link, index) => (
            <button
              key={link.label}
              onClick={() => handleNavigate(link.view)}
              className={`quick-action-item flex items-center gap-3 group`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Label */}
              <span className="glass-card-strong px-3 py-1.5 text-sm font-medium text-dark whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                {link.label}
              </span>
              {/* Icon Button */}
              <div className={`w-12 h-12 rounded-full ${link.color} shadow-lg flex items-center justify-center hover:scale-110 transition-transform`}>
                <link.icon className="w-5 h-5 text-white" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Main FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-glass-hover flex items-center justify-center transition-all duration-300 ${
          isOpen 
            ? 'bg-dark rotate-45' 
            : 'bg-red hover:scale-110'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Plus className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Pulse Animation Ring */}
      {!isOpen && (
        <div className="absolute inset-0 rounded-full bg-red animate-ping opacity-20" />
      )}
    </div>
  );
}
