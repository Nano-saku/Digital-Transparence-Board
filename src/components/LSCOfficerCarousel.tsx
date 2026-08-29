import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const OFFICER_IMAGES = Array.from({ length: 18 }, (_, index) => `/${index + 1}.jpg`);

export default function LSCOfficerCarousel() {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const move = useCallback((direction: number) => {
    setActive((current) => (current + direction + OFFICER_IMAGES.length) % OFFICER_IMAGES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = window.setInterval(() => move(1), 4500);
    return () => window.clearInterval(interval);
  }, [isPaused, move]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'ArrowRight') move(1);
  };

  return (
    <div
      className="relative w-full outline-none"
      tabIndex={0}
      role="region"
      aria-label="LSC Officers carousel"
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className="relative mx-auto h-[min(72vw,27rem)] min-h-[20rem] w-full max-w-5xl [perspective:1400px]">
        {OFFICER_IMAGES.map((src, index) => {
          let relative = index - active;
          if (relative > OFFICER_IMAGES.length / 2) relative -= OFFICER_IMAGES.length;
          if (relative < -OFFICER_IMAGES.length / 2) relative += OFFICER_IMAGES.length;

          const distance = Math.abs(relative);
          const visible = distance <= 2;
          const isActive = relative === 0;

          return (
            <button
              key={src}
              type="button"
              aria-label={`Show officer image ${index + 1}`}
              aria-hidden={!visible}
              tabIndex={visible ? 0 : -1}
              onClick={() => setActive(index)}
              className="absolute left-1/2 top-1/2 overflow-hidden rounded-2xl border-2 border-white/50 bg-[#0E1A4D] shadow-2xl transition-[transform,opacity] duration-700 ease-out"
              style={{
                width: 'clamp(13rem, 32vw, 20rem)',
                height: 'clamp(17rem, 48vw, 25rem)',
                opacity: visible ? (isActive ? 1 : 0.62) : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transform: `translate(-50%, -50%) translateX(${relative * 38}%) translateZ(${-distance * 180}px) rotateY(${-relative * 22}deg) scale(${Math.max(0.68, 1 - distance * 0.13)})`,
                zIndex: 10 - distance,
              }}
            >
              <img
                src={src}
                alt={`LSC officer ${index + 1}`}
                draggable={false}
                className="h-full w-full object-contain"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0E1A4D]/80 to-transparent p-3 text-right text-xs font-semibold text-white">
                {index + 1} / {OFFICER_IMAGES.length}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous officer"
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/50 bg-[#0E1A4D]/80 p-2 text-white shadow-lg transition hover:bg-[#1B2E8C] sm:left-6 sm:p-3"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Next officer"
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/50 bg-[#0E1A4D]/80 p-2 text-white shadow-lg transition hover:bg-[#1B2E8C] sm:right-6 sm:p-3"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Choose officer image">
        {OFFICER_IMAGES.map((src, index) => (
          <button
            key={`indicator-${src}`}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Go to officer image ${index + 1}`}
            aria-current={active === index ? 'true' : undefined}
            className={`h-2.5 rounded-full transition-all ${active === index ? 'w-7 bg-lsc-gold' : 'w-2.5 bg-white/50 hover:bg-white/80'}`}
          />
        ))}
      </div>
    </div>
  );
}