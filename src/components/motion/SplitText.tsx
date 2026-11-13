import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, SplitText as GSAPSplitText, useGSAP, prefersReducedMotion } from "@/lib/gsap";

interface SplitTextProps {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  /** Animate by "words" (calmer, for page titles) or "chars" (hero headlines). */
  by?: "words" | "chars";
  delay?: number;
}

/** Staggered word rise that resolves from a blur (GSAP SplitText). */
export default function SplitText({ as: Tag = "h1", className, children, by = "words", delay = 0 }: SplitTextProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      const split = GSAPSplitText.create(ref.current, { type: by === "chars" ? "words,chars" : "words" });
      gsap.from(by === "chars" ? split.chars : split.words, {
        yPercent: 70,
        opacity: 0,
        filter: "blur(12px)",
        clearProps: "filter",
        duration: by === "chars" ? 0.9 : 0.7,
        stagger: by === "chars" ? 0.018 : 0.05,
        delay,
        ease: "expo.out",
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
