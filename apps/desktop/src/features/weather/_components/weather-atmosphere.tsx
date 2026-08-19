import { useEffect, useRef } from "react";
import type { WeatherCondition } from "../../../types/api/WeatherCondition";
import { hasPrecipitation } from "../_lib/format";

function noise(index: number, salt: number): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Animated rain/snow streaks over the weather hero — Swift WeatherAtmosphereView. */
export function WeatherAtmosphere({ condition }: { condition: WeatherCondition }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!hasPrecipitation(condition)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSnow = condition === "snow";
    const count = isSnow ? 28 : 48;
    let raf = 0;

    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    const draw = (time: number) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < count; i++) {
        const x = noise(i, 1) * width;
        const offset = noise(i, 2);
        const speed = isSnow ? 0.08 : 0.22;
        const travel = (time * speed + offset) % 1;
        const len = isSnow ? 3 : 10 + noise(i, 5) * 8;
        const y = travel * (height + len) - len;
        const opacity = 0.15 + noise(i, 3) * 0.3;

        ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
        ctx.lineWidth = isSnow ? 1.2 : 0.9;
        ctx.beginPath();
        if (isSnow) {
          const sway = Math.sin(time * 0.6 + noise(i, 4) * 6.28) * 6;
          ctx.arc(x + sway, y, 1 + noise(i, 5), 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + 2.4, y + len);
          ctx.stroke();
        }
      }
    };

    if (reduced) {
      draw(0);
    } else {
      const loop = (t: number) => {
        draw(t / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [condition]);

  if (!hasPrecipitation(condition)) return null;

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[1]" aria-hidden />
  );
}
