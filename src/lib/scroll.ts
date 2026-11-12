import type Lenis from "lenis";

/** The active Lenis instance (set by <SmoothScroll />), if smooth scrolling is on. */
export const smooth: { lenis: Lenis | null } = { lenis: null };

/** Jump to a scroll position instantly (Lenis-aware); used on view changes. */
export function scrollToY(y: number) {
  if (smooth.lenis) smooth.lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}

export const scrollToTop = () => scrollToY(0);
