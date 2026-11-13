/*!
 * Liquid glass refraction for one element: an SVG displacement map applied
 * through backdrop-filter bends the backdrop at the rim, with a faint prism
 * fringe. Chromium only; Safari and Firefox get a frosted fallback.
 *
 * Adapted from liquid-glass.js by Deepika Rao (MIT License,
 * https://github.com/deepika-builds/liquid-glass):
 *   Copyright (c) 2026 Deepika Rao. Permission is hereby granted, free of
 *   charge, to any person obtaining a copy of this software and associated
 *   documentation files, to deal in the Software without restriction,
 *   subject to including this copyright and permission notice. THE SOFTWARE
 *   IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
let uid = 0;
let defs: SVGDefsElement | null = null;

export interface LiquidGlassOptions {
  /** Displacement strength (negative = magnifying bulge). */
  scale?: number;
  /** Per-channel scale stagger for the prism fringe; 0 disables it. */
  chroma?: number;
  /** Neutral inset as a fraction of the smaller side (keeps the interior clear). */
  border?: number;
  /** Softness (px) of the edge curvature. */
  mapBlur?: number;
  /** Backdrop blur (px) behind the glass. */
  blur?: number;
  /** Backdrop saturation boost. */
  saturate?: number;
  /** Frosted blur (px) where refraction is unsupported. */
  fallbackBlur?: number;
}

const supported = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if ((/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) || /Firefox/.test(ua)) return false;
  return typeof CSS !== "undefined" && CSS.supports("backdrop-filter", "url(#lg)");
})();

function ensureDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, "svg");
  // Zero size (not display:none) keeps feImage renderable.
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

/** Red ramp = X displacement, blue ramp = Y; a blurred neutral-grey inset confines the bulge to the rim. */
function makeMap(w: number, h: number, radius: number, border: number, mapBlur: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const gx = ctx.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, "rgb(0,0,0)");
  gx.addColorStop(1, "rgb(255,0,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, w, h);
  const gy = ctx.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, "rgb(0,0,0)");
  gy.addColorStop(1, "rgb(0,0,255)");
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  const inset = border * Math.min(w, h);
  ctx.filter = `blur(${mapBlur}px)`;
  ctx.fillStyle = "rgba(128,128,128,0.93)";
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(radius - inset, 2));
  ctx.fill();
  return canvas.toDataURL();
}

function buildFilter(id: string, scales: number[]) {
  const filter = document.createElementNS(SVG_NS, "filter");
  Object.entries({ id, x: "0", y: "0", width: "100%", height: "100%", "color-interpolation-filters": "sRGB" }).forEach(([k, v]) => filter.setAttribute(k, v));
  const feImage = document.createElementNS(SVG_NS, "feImage");
  Object.entries({ x: "0", y: "0", result: "map", preserveAspectRatio: "none" }).forEach(([k, v]) => feImage.setAttribute(k, v));
  filter.appendChild(feImage);
  const keep = ["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"];
  scales.forEach((scale, i) => {
    const disp = document.createElementNS(SVG_NS, "feDisplacementMap");
    Object.entries({ in: "SourceGraphic", in2: "map", scale: String(scale), xChannelSelector: "R", yChannelSelector: "B", result: `d${i}` }).forEach(([k, v]) => disp.setAttribute(k, v));
    const cm = document.createElementNS(SVG_NS, "feColorMatrix");
    Object.entries({ in: `d${i}`, type: "matrix", values: keep[i], result: `c${i}` }).forEach(([k, v]) => cm.setAttribute(k, v));
    filter.append(disp, cm);
  });
  const b1 = document.createElementNS(SVG_NS, "feBlend");
  Object.entries({ in: "c0", in2: "c1", mode: "screen", result: "c01" }).forEach(([k, v]) => b1.setAttribute(k, v));
  const b2 = document.createElementNS(SVG_NS, "feBlend");
  Object.entries({ in: "c01", in2: "c2", mode: "screen" }).forEach(([k, v]) => b2.setAttribute(k, v));
  filter.append(b1, b2);
  ensureDefs().appendChild(filter);
  return { filter, feImage };
}

/** Applies refraction to `el`; returns a cleanup function. */
export function liquidGlass(el: HTMLElement, options: LiquidGlassOptions = {}): () => void {
  const o = { scale: -112, chroma: 6, border: 0.07, mapBlur: 12, blur: 3, saturate: 1.5, fallbackBlur: 16, ...options };
  if (!supported) {
    const frosted = `blur(${o.fallbackBlur}px) saturate(${o.saturate})`;
    el.style.backdropFilter = frosted;
    el.style.setProperty("-webkit-backdrop-filter", frosted);
    return () => {
      el.style.backdropFilter = "";
      el.style.removeProperty("-webkit-backdrop-filter");
    };
  }
  const id = `lg-filter-${++uid}`;
  const parts = buildFilter(id, [o.scale, o.scale + o.chroma, o.scale + 2 * o.chroma]);
  const refresh = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, h / 2);
    parts.feImage.setAttribute("href", makeMap(w, h, radius, o.border, o.mapBlur));
    parts.feImage.setAttribute("width", String(w));
    parts.feImage.setAttribute("height", String(h));
  };
  refresh();
  el.style.backdropFilter = `url(#${id}) blur(${o.blur}px) saturate(${o.saturate})`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  });
  ro.observe(el);
  return () => {
    ro.disconnect();
    clearTimeout(timer);
    parts.filter.remove();
    el.style.backdropFilter = "";
  };
}
