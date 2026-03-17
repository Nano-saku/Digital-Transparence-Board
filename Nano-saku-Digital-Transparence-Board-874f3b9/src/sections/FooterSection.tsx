import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { 
  Search, Eye, MessageCircle, AlertTriangle, Lightbulb, 
  Shield, Mail, Phone, MapPin, ExternalLink
} from 'lucide-react';
import type { ViewState } from '@/types';

interface FooterSectionProps {
  onNavigate: (view: ViewState) => void;
}

export default function FooterSection({ onNavigate }: FooterSectionProps) {
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        footerRef.current,
        { y: '6vh', opacity: 0 },
        { 
          y: 0, 
          opacity: 1, 
          duration: 0.5, 
          ease: 'power2.out',
          scrollTrigger: {
            trigger: footerRef.current,
            start: 'top 90%',
            end: 'top 60%',
            scrub: false,
          }
        }
      );
    }, footerRef);

    return () => ctx.revert();
  }, []);

  const quickLinks = [
    { label: 'Search Record', view: 'landing' as ViewState, icon: Search },
    { label: 'Transparency Board', view: 'transparency' as ViewState, icon: Eye },
    { label: 'Inquiry', view: 'inquiry' as ViewState, icon: MessageCircle },
    { label: 'Complaint', view: 'complaint' as ViewState, icon: AlertTriangle },
    { label: 'Suggestion', view: 'suggestion' as ViewState, icon: Lightbulb },
    { label: 'Admin Login', view: 'admin-login' as ViewState, icon: Shield },
  ];

  const contactInfo = [
    { icon: Mail, label: 'studentcouncil@university.edu' },
    { icon: Phone, label: '+63 (2) 8123-4567' },
    { icon: MapPin, label: 'Student Council Office, Main Building' },
  ];

  return (
    <footer 
      ref={footerRef}
      className="w-full gradient-bg-red relative overflow-hidden py-12 lg:py-16"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-0 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="glass-card-strong p-6 lg:p-10 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red flex items-center justify-center">
                  <span className="text-white font-display font-bold text-sm">SB</span>
                </div>
                <span className="font-display font-semibold text-dark text-xl">
                  StudentBoard
                </span>
              </div>
              <p className="text-text-secondary text-sm leading-relaxed mb-4">
                Built for transparency. Designed for students. 
                Your trusted platform for attendance tracking and financial transparency.
              </p>
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Shield className="w-4 h-4 text-red" />
                <span>Secure & Transparent</span>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-display font-semibold text-dark mb-4">Quick Links</h4>
              <ul className="space-y-2">
                {quickLinks.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => onNavigate(link.view)}
                      className="flex items-center gap-2 text-sm text-text-secondary hover:text-red transition-colors"
                    >
                      <link.icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-display font-semibold text-dark mb-4">Contact Us</h4>
              <ul className="space-y-3">
                {contactInfo.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-text-secondary">
                    <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Office Hours */}
            <div>
              <h4 className="font-display font-semibold text-dark mb-4">Office Hours</h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex justify-between">
                  <span>Monday - Friday</span>
                  <span className="font-medium text-dark">8:00 AM - 5:00 PM</span>
                </li>
                <li className="flex justify-between">
                  <span>Saturday</span>
                  <span className="font-medium text-dark">9:00 AM - 12:00 PM</span>
                </li>
                <li className="flex justify-between">
                  <span>Sunday</span>
                  <span className="font-medium text-dark">Closed</span>
                </li>
              </ul>
              <div className="mt-4 p-3 rounded-xl bg-red/5">
                <p className="text-xs text-text-secondary">
                  <span className="font-medium text-dark">Data Privacy Notice:</span> All data is handled in compliance with the Data Privacy Act of 2012 (RA 10173).
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-8 pt-6 border-t border-white/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-text-secondary text-center sm:text-left">
              © 2026 Student Council. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <button className="text-sm text-text-secondary hover:text-red transition-colors">
                Privacy Policy
              </button>
              <button className="text-sm text-text-secondary hover:text-red transition-colors">
                Terms of Service
              </button>
              <button className="text-sm text-text-secondary hover:text-red transition-colors flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                Help Center
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
