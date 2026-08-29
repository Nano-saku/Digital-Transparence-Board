import { useEffect, useRef, useCallback } from 'react';

/**
 * Animated network background – draws drifting nodes connected by
 * semi-transparent lines on a <canvas>. Purely decorative, so it is
 * pointer-events-none and absolutely positioned behind its parent's content.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 0-1 opacity used for the fill & stroke */
  opacity: number;
}

interface AnimatedNetworkProps {
  /** Number of nodes (default 40) */
  nodeCount?: number;
  /** Maximum distance (px) between two nodes to draw an edge */
  maxEdgeDistance?: number;
  /** Base speed multiplier */
  speed?: number;
  className?: string;
}

export default function AnimatedNetwork({
  nodeCount = 40,
  maxEdgeDistance = 160,
  speed = 0.35,
  className,
}: AnimatedNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const rafRef = useRef<number>(0);

  const initNodes = useCallback(
    (w: number, h: number) => {
      const nodes: Node[] = [];
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          radius: 2 + Math.random() * 2.5,
          opacity: 0.25 + Math.random() * 0.4,
        });
      }
      nodesRef.current = nodes;
    },
    [nodeCount, speed],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (nodesRef.current.length === 0) {
        initNodes(rect.width, rect.height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;

      // Move nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
      }

      // Draw edges — white lines for contrast against the warm gradient
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxEdgeDistance) {
            const alpha = 1 - dist / maxEdgeDistance;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * alpha})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes — bright white dots with soft outer glow
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + n.opacity * 0.4})`;
        ctx.fill();

        // soft outer glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${n.opacity * 0.15})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [initNodes, maxEdgeDistance]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
