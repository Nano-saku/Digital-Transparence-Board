import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const IMAGES = Array.from({ length: 18 }, (_, i) => `/${i + 1}.jpg`);
const N = IMAGES.length;

/** 3D cover-flow of officer photos; auto-advances unless hovered/focused. */
export default function LSCOfficerCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const move = (dir: number) => setActive((a) => (a + dir + N) % N);
  // Horizontal swipe on touch screens; vertical drags keep scrolling the page (touch-action: pan-y).
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % N), 4500);
    return () => clearInterval(id);
  }, [paused]);

  const arrow = "btn btn-icon absolute top-1/2 z-20 -translate-y-1/2 border border-white/25 bg-white/10 text-white hover:bg-white/20 md:backdrop-blur";

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="LSC officers carousel"
      className="relative w-full outline-none"
      onKeyDown={(e) => (e.key === "ArrowLeft" ? move(-1) : e.key === "ArrowRight" && move(1))}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="relative mx-auto h-[min(72vw,27rem)] min-h-[20rem] w-full max-w-5xl touch-pan-y [perspective:1400px]"
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY };
          setPaused(true);
        }}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (e.pointerType !== "mouse") setPaused(false);
          if (!start) return;
          const dx = e.clientX - start.x;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - start.y)) move(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {IMAGES.map((src, i) => {
          // Shortest signed distance from the active slide, wrapping around.
          const rel = ((i - active + N + N / 2) % N) - N / 2;
          const dist = Math.abs(rel);
          const visible = dist <= 2;
          return (
            <button
              key={src}
              type="button"
              aria-label={`Show officer image ${i + 1}`}
              aria-hidden={!visible}
              tabIndex={visible ? 0 : -1}
              onClick={() => setActive(i)}
              className="absolute left-1/2 top-1/2 h-[clamp(17rem,48vw,25rem)] w-[clamp(13rem,32vw,20rem)] overflow-hidden rounded-3xl border border-white/30 bg-brand-950 shadow-lift transition-[transform,opacity] duration-700 ease-out"
              style={{
                opacity: visible ? (rel === 0 ? 1 : 0.6) : 0,
                pointerEvents: visible ? "auto" : "none",
                transform: `translate(-50%, -50%) translateX(${rel * 38}%) translateZ(${-dist * 180}px) rotateY(${-rel * 22}deg) scale(${Math.max(0.68, 1 - dist * 0.13)})`,
                zIndex: 10 - dist,
              }}
            >
              <img src={src} alt={`LSC officer ${i + 1}`} draggable={false} className="h-full w-full object-contain" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/80 to-transparent p-3 text-right text-xs font-semibold text-white">
                {i + 1} / {N}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={() => move(-1)} aria-label="Previous officer" className={cn(arrow, "left-1 sm:left-4")}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="Next officer" className={cn(arrow, "right-1 sm:right-4")}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap justify-center">
        {IMAGES.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Go to officer image ${i + 1}`}
            aria-current={active === i || undefined}
            className="group grid h-8 place-items-center px-1"
          >
            {/* Small visual dot inside a larger tap area. */}
            <span className={cn("h-2 rounded-full transition-all", active === i ? "w-7 bg-powder" : "w-2 bg-white/40 group-hover:bg-white/70")} />
          </button>
        ))}
      </div>
    </div>
  );
}
