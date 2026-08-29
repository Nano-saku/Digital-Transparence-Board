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
    { icon: Mail, label: 'dsscsclsc@gmail.com' },
    { icon: Phone, label: 'Not have a Number yet!' },
    { icon: MapPin, label: 'Student Council Office, Likod Sa SB 101' },
  ];

  return (
    <footer 
      ref={footerRef}
      className="w-full relative overflow-hidden py-12 lg:py-16"
      style={{ background: 'var(--dssc-deep-navy)' }}
    >
      {/* Subtle orb accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-20 w-72 h-72 rounded-full blur-3xl opacity-10" style={{ background: '#3A5FE0' }} />
        <div className="absolute bottom-0 right-20 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: '#1B2E8C' }} />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-52 h-52 opacity-[0.05]"
          style={{ backgroundImage: 'url(/lsc-logo.jpg)', backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
      </div>
      {/* Gold top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'var(--grad-card-accent)' }} />

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <img src="/lsc-logo.jpg" alt="Local Student Council logo"
                  className="w-10 h-10 rounded-xl object-cover ring-2 ring-lsc-gold/40" />
                <div>
                  <span className="font-display font-bold text-white text-base block tracking-wide">DSSC — LSC</span>
                  <span className="text-silver-gray text-[0.65rem] tracking-widest uppercase">Santa Cruz</span>
                </div>
              </div>
              <p className="text-silver-gray text-sm leading-relaxed mb-3">
                Built for transparency. Designed for students.
              </p>
              <p className="dssc-tagline">"One Step Better Than Yesterday."</p>

              <div className="flex items-center gap-2 text-sm text-silver-gray">
                <Shield className="w-4 h-4 text-lsc-gold" />
                <span>Secure & Transparent</span>
              </div>
              <div className="mt-6">
                <h4 className="font-display font-semibold text-white mb-2">Developers</h4>
                <ul className="space-y-1 text-sm text-silver-gray">
                  <li>Mark Louise Eyas - Back-end</li>
                  <li>Justine Renz Capapas - UI/UX Front-end</li>
                  <li>John Mark Mahidlawon - Dev Ops</li>
                </ul>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-display font-semibold text-white mb-4">Quick Links</h4>
              <ul className="space-y-2">
                {quickLinks.map((link) => (
                  <li key={link.label}>
                    <button
onClick={() => onNavigate(link.view)}
                      className="inline-flex items-center text-sm text-silver-gray gap-2 hover:text-white transition-colors"
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
              <h4 className="font-display font-semibold text-white mb-4">Contact Us</h4>
              <ul className="space-y-3">
                {contactInfo.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-silver-gray">
                    <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Office Hours */}
            <div>
              <h4 className="font-display font-semibold text-white mb-4">Office Hours</h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex justify-between">
                  <span>Monday - Friday</span>
                  <span className="font-medium text-white">8:00 AM - 5:00 PM</span>
                </li>
                <li className="flex justify-between">
                  <span>Saturday</span>
                  <span className="font-medium text-white">Closed</span>
                </li>
                <li className="flex justify-between">
                  <span>Sunday</span>
                  <span className="font-medium text-white">Closed</span>
                </li>
              </ul>
              <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-text-secondary">
                  <span className="font-medium text-white">Data Privacy Notice:</span> All data is handled in compliance with the Data Privacy Act of 2012 (RA 10173).
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-8 pt-6 border-t border-white/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-silver-gray text-center sm:text-left">
              © 2026 Student Council. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <button className="text-sm text-silver-gray hover:text-white transition-colors">
                Privacy Policy
              </button>
              <button className="text-sm text-silver-gray hover:text-white transition-colors">
                Terms of Service
              </button>
              <button className="inline-flex items-center gap-1 text-sm text-silver-gray hover:text-white transition-colors">
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
