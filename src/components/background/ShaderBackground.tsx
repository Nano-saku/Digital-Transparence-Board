import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/gsap";

const ShaderCanvas = lazy(() => import("./ShaderCanvas"));

/** Renders nothing if WebGL fails, leaving the CSS gradient underneath. */
class WebGLGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("Shader background unavailable:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const hasWebGL = () => {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
};

/**
 * The site's backdrop: a static gradient in the shader's colours paints
 * instantly; the moving WebGL gradient fades in over it once its code has
 * loaded (after first paint, so it never delays the page). Phones render at
 * a lower pixel density; "reduce motion" gets a still frame.
 */
export default function ShaderBackground() {
  const [ready, setReady] = useState(false);
  const [webgl] = useState(hasWebGL);
  const still = prefersReducedMotion();
  const pixelDensity = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? 1 : 1.5;

  useEffect(() => {
    if (!webgl) return;
    const id = "requestIdleCallback" in window ? requestIdleCallback(() => setReady(true), { timeout: 1500 }) : setTimeout(() => setReady(true), 600);
    return () => ("cancelIdleCallback" in window ? cancelIdleCallback(id as number) : clearTimeout(id));
  }, [webgl]);

  return (
    <div aria-hidden className="shader-bg pointer-events-none fixed inset-0 -z-10">
      {ready && (
        <WebGLGuard>
          <Suspense fallback={null}>
            <div className="absolute inset-0 animate-in fade-in-0 duration-1000">
              <ShaderCanvas still={still} pixelDensity={pixelDensity} />
            </div>
          </Suspense>
        </WebGLGuard>
      )}
      {/* Keeps white text legible over the brightest (lime) areas; heavier in dark mode. */}
      <div className="shader-veil absolute inset-0" />
    </div>
  );
}
