"use client";

import { useEffect, useState } from "react";

const LINES = [
  "opening your desk",
  "pulling your teams",
  "checking what's due",
  "warming up the board",
];

export function DeskLoader() {
  const [lineIdx, setLineIdx] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const lineT = setInterval(() => setLineIdx((n) => (n + 1) % LINES.length), 1600);
    const dotT  = setInterval(() => setDots((n) => (n + 1) % 4), 480);
    return () => { clearInterval(lineT); clearInterval(dotT); };
  }, []);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 0,
      background: "var(--background)",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Subtle grid backdrop */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        opacity: 0.45,
        pointerEvents: "none",
      }} />

      {/* Radial glow behind the mark */}
      <div style={{
        position: "absolute",
        width: 320,
        height: 320,
        borderRadius: "50%",
        background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)",
        opacity: 0.6,
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>

        {/* Logo mark */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}>
          {/* CP badge */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            boxShadow: "0 0 0 1px var(--border), 0 8px 24px var(--shadow-lg)",
          }}>
            CP
          </div>

          {/* App name */}
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--foreground)",
            letterSpacing: "-0.01em",
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            opacity: 0.7,
          }}>
            Collab Platform
          </span>
        </div>

        {/* Cubicle mark — 2×2 breathing squares */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 18px)",
          gridTemplateRows: "repeat(2, 18px)",
          gap: 6,
        }}>
          {([0, 0.16, 0.48, 0.32] as number[]).map((d, i) => (
            <div key={i} className="cube" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>

        {/* Terminal line */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          fontFamily: "var(--font-mono), ui-monospace, 'Cascadia Code', Menlo, monospace",
          fontSize: 12,
          color: "var(--muted)",
          letterSpacing: "0.03em",
          minWidth: 220,
          justifyContent: "center",
        }}>
          <span style={{ color: "var(--accent)", marginRight: 7, opacity: 0.7 }}>▸</span>
          <span style={{ transition: "opacity 0.3s" }}>{LINES[lineIdx]}</span>
          <span style={{ color: "var(--accent)", marginLeft: 2 }}>
            {"...".slice(0, dots)}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: 160,
          height: 2,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
        }}>
          <div className="loader-bar" />
        </div>

      </div>
    </div>
  );
}
