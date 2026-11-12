import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger direct children instead of revealing the wrapper as one block. */
  stagger?: boolean;
}

/** Scroll-triggered fade/rise (React Bits "AnimatedContent" pattern on ScrollTrigger). */
export default function Reveal({ children, className, stagger }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.from(stagger ? ref.current.children : ref.current, {
        y: 16,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
        ease: "power2.out",
        clearProps: "transform",
        scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
