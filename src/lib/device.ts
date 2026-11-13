/** Phones (and Data Saver) get the light build: no WebGL, no blur, no smooth-scroll engine, no page morphs. */
export const LIGHT_QUERY = "(max-width: 767px)";

export function isLightDevice(): boolean {
  if (typeof window === "undefined") return false;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return saveData || window.matchMedia(LIGHT_QUERY).matches;
}
