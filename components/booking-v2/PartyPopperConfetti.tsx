"use client";

import { useEffect, useRef } from "react";

interface PartyPopperConfettiProps {
  durationMs?: number;
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  shape: "rect" | "circle" | "emoji";
  emoji?: string;
  rotation: number;
  vRotation: number;
  opacity: number;
  decay: number;
}

const CONFETTI_COLORS = [
  "#22c55e", // emerald green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#e11d48", // rose
  "#eab308", // yellow
];

const PARTY_EMOJIS = ["🎉", "🎊", "✨", "🥳"];

export function PartyPopperConfetti({
  durationMs = 2000,
  onComplete,
}: PartyPopperConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles: Particle[] = [];
    const startTime = Date.now();
    let animationFrameId: number;

    const spawnBurst = (
      originX: number,
      originY: number,
      count: number,
      angleDeg: number,
      spreadDeg: number,
    ) => {
      for (let i = 0; i < count; i++) {
        const angle =
          ((angleDeg - spreadDeg / 2 + Math.random() * spreadDeg) * Math.PI) /
          180;
        const speed = 10 + Math.random() * 18;
        const isEmoji = Math.random() < 0.15;

        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: isEmoji ? 20 : 6 + Math.random() * 8,
          color:
            CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          shape: isEmoji ? "emoji" : Math.random() > 0.5 ? "rect" : "circle",
          emoji: isEmoji
            ? PARTY_EMOJIS[Math.floor(Math.random() * PARTY_EMOJIS.length)]
            : undefined,
          rotation: Math.random() * 360,
          vRotation: (Math.random() - 0.5) * 12,
          opacity: 1,
          decay: 0.008 + Math.random() * 0.012,
        });
      }
    };

    // Initial festive burst from bottom left, bottom right and bottom center
    spawnBurst(width * 0.15, height * 0.95, 50, -65, 45);
    spawnBurst(width * 0.85, height * 0.95, 50, -115, 45);
    spawnBurst(width * 0.5, height * 0.9, 45, -90, 60);

    let lastSpawn = startTime;

    const render = () => {
      const now = Date.now();
      const elapsed = now - startTime;

      // Continuously pop more confetti during the active duration (e.g. 2s)
      if (elapsed < durationMs && now - lastSpawn > 180) {
        lastSpawn = now;
        spawnBurst(
          width * (0.2 + Math.random() * 0.6),
          height * 0.9,
          25,
          -90,
          70,
        );
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // Gravity
        p.vx *= 0.98; // Air resistance
        p.vy *= 0.98;
        p.rotation += p.vRotation;
        p.opacity -= p.decay;

        if (p.opacity <= 0 || p.y > height + 50) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);

        if (p.shape === "emoji" && p.emoji) {
          ctx.font = `${p.size}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.emoji, 0, 0);
        } else if (p.shape === "circle") {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        }

        ctx.restore();
      }

      if (elapsed >= durationMs && particles.length === 0) {
        onComplete?.();
        return;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    const safetyTimer = setTimeout(() => {
      onComplete?.();
    }, durationMs + 2500);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      clearTimeout(safetyTimer);
    };
  }, [durationMs, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999] h-full w-full"
      aria-hidden="true"
    />
  );
}
