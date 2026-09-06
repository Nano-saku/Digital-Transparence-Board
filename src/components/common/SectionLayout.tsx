import { useRef, type ReactNode } from "react";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionBackButton from "@/components/SectionBackButton";

/**
 * Reusable section wrapper that provides the standard layout pattern used
 * by every admin section:
 *   - Full-page gradient background
 *   - GSAP entrance animation
 *   - Section back button + title/subtitle header
 *   - Content slot
 *   - Optional footer slot
 *
 * @example
 * ```tsx
 * <SectionLayout
 *   title="Student Management"
 *   subtitle="Manage enrolled students"
 *   onBack={() => navigateTo("admin-dashboard")}
 *   headerActions={<button>Add Student</button>}
 *   gradientClass="gradient-bg-orange"
 * >
 *   <div>{/* main content *\/}</div>
 * </SectionLayout>
 * ```
 */
interface SectionLayoutProps {
  /** Page title displayed in the header. */
  title: string;
  /** Subtitle / description under the title. */
  subtitle?: string;
  /** Back button click handler. */
  onBack: () => void;
  /** Content rendered below the header. */
  children: ReactNode;
  /** Action buttons rendered in the header (right side). */
  headerActions?: ReactNode;
  /** Gradient background class (default: "gradient-bg-orange"). */
  gradientClass?: string;
  /** Additional CSS classes on the outer <section>. */
  className?: string;
  /** Content shown below the main children. */
  footer?: ReactNode;
}

export default function SectionLayout({
  title,
  subtitle,
  onBack,
  children,
  headerActions,
  gradientClass = "gradient-bg-orange",
  className = "",
  footer,
}: SectionLayoutProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useSectionEntrance(sectionRef, [
    {
      ref: contentRef,
      from: { y: "6vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
    },
  ]);

  return (
    <section
      ref={sectionRef}
      className={`min-h-screen w-full ${gradientClass} relative overflow-hidden py-20 lg:py-24 ${className}`}
    >
      <div
        ref={contentRef}
        className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12"
      >
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <SectionBackButton onClick={onBack} />
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                {title}
              </h1>
              {subtitle && (
                <p className="text-text-secondary text-sm">{subtitle}</p>
              )}
            </div>
          </div>
          {headerActions && <div className="flex flex-wrap gap-2">{headerActions}</div>}
        </div>

        {/* Content */}
        {children}

        {/* Optional footer */}
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </section>
  );
}
