import { useEffect, type DependencyList, type RefObject } from "react";
import { gsap } from "gsap";

/**
 * Declarative wrapper around the GSAP "section entrance" pattern that was
 * previously duplicated inside nearly every section component:
 *
 *   gsap.context(() => {
 *     const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
 *     ...
 *   }, sectionRef);
 *
 * Each target may animate the element itself (`ref.current`) or a set of
 * children matched by `selector`, and may carry a timeline position string
 * (e.g. "-=0.4") to control overlap with the previous tween.
 */
export interface SectionEntranceTarget {
  /** Element (or parent whose `selector` matches children) to animate. */
  ref: RefObject<HTMLElement | null>;
  /** Animate `ref.current.querySelectorAll(selector)` instead of the ref. */
  selector?: string;
  from: gsap.TweenVars;
  to: gsap.TweenVars;
  /** Timeline position for this tween; omitted targets play one after another. */
  position?: string;
}

/**
 * Plays a GSAP entrance timeline once on mount, scoped to `sectionRef`, and
 * reverts it on unmount. Hand every target config once per mount; pass an
 * explicit `deps` array when the animation must restart (not needed for the
 * standard sections, which animate content that is already rendered).
 */
export function useSectionEntrance(
  sectionRef: RefObject<HTMLElement | null>,
  targets: SectionEntranceTarget[],
  deps: DependencyList = []
): void {
  // Targets capture refs (stable for the life of the component) and are only
  // read inside the effect, so they are intentionally not listed in `deps`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(
      () => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        for (const target of targets) {
          const elements = target.selector
            ? target.ref.current?.querySelectorAll(target.selector)
            : target.ref.current;
          if (!elements || ("length" in elements && elements.length === 0)) {
            continue;
          }
          tl.fromTo(elements, target.from, target.to, target.position);
        }
      },
      sectionRef as RefObject<HTMLElement>
    );

    return () => ctx.revert();
  }, deps);
}