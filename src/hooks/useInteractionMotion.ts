import { useEffect } from "react";
import { trackPressOrigin } from "@/lib/transition";

/** Remembers what the user pressed so pages and modals can grow out of it (and shrink back into it). */
export function useInteractionMotion() {
  useEffect(() => trackPressOrigin(), []);
}
