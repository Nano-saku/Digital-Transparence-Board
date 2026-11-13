import { useEffect } from "react";
import { trackPressOrigin } from "@/lib/transition";
import { prefersReducedMotion } from "@/lib/gsap";

/**
 * App-wide interaction motion, by event delegation:
 *  - remembers what the user pressed so pages and modals grow out of it (and shrink back into it);
 *  - buttons send two concentric rings out from the press point.
 */
export function useInteractionMotion() {
  useEffect(() => trackPressOrigin(), []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>(".btn");
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.4;
      [0, 110].forEach((delay) => {
        const ring = document.createElement("span");
        ring.className = "press-ring";
        Object.assign(ring.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px`, animationDelay: `${delay}ms` });
        btn.appendChild(ring);
        ring.addEventListener("animationend", () => ring.remove(), { once: true });
      });
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
}
