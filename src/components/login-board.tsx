function Cursor({ x, y, name, color, drift }: { x: number; y: number; name: string; color: string; drift: string }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, animation: `${drift} ease-in-out infinite` }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.22))" }}>
        <path d="M3 2.5 L15.5 9.2 L9.6 10.4 L7.7 16.2 Z" fill={color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span style={{ position: "absolute", left: 14, top: 16, background: color, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap", fontFamily: "var(--font-sans)", boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}>
        {name}
      </span>
    </div>
  );
}

export function LoginBoard() {
  return (
    <div style={{ position: "relative", width: 460, height: 520 }}>
      <style>{`
        @keyframes lb-drift-a { 0%,100% { transform: translate(0,0); } 50% { transform: translate(10px,-8px); } }
        @keyframes lb-drift-b { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-9px,7px); } }
        @keyframes lb-drift-c { 0%,100% { transform: translate(0,0); } 50% { transform: translate(7px,9px); } }
        @keyframes lb-pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>

      <div style={{ position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--card)", boxShadow: "0 24px 60px rgba(0,0,0,0.14)" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)", backgroundSize: "26px 26px", opacity: 0.5 }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.16) 100%)", pointerEvents: "none" }} />
      </div>

      <div style={{ position: "absolute", top: 20, right: 14, width: 150, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 20px rgba(0,0,0,0.12)" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", marginBottom: 10 }}>Palette</div>
        <div style={{ display: "flex", gap: 7 }}>
          {["#0E5C46", "#7fae95", "#f4edd6", "#B23A26", "#182019"].map((c) => (
            <span key={c} style={{ width: 20, height: 20, borderRadius: 5, background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }} />
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", top: 92, left: 22, width: 148, transform: "rotate(-4deg)" }}>
        <div style={{ position: "relative", background: "#f4edd6", color: "#3a3324", borderRadius: 3, padding: "16px 16px 20px", boxShadow: "0 12px 26px rgba(0,0,0,0.18)", fontFamily: "'Caveat','Segoe Script',cursive", fontSize: 21, lineHeight: 1.2 }}>
          keep the green deep — no neon
          <span style={{ position: "absolute", right: 0, bottom: 0, width: 0, height: 0, borderStyle: "solid", borderWidth: "0 0 16px 16px", borderColor: "transparent transparent rgba(0,0,0,0.10) transparent" }} />
        </div>
      </div>

      <div style={{ position: "absolute", top: 244, left: 116, width: 232, height: 96 }}>
        <div style={{ position: "absolute", inset: -8, border: "1.5px solid var(--accent)", borderRadius: 8, animation: "lb-pulse 2.4s ease-in-out infinite" }}>
          {[["-4px", "-4px"], ["-4px", "auto"], ["auto", "-4px"], ["auto", "auto"]].map(([t, l], i) => (
            <span key={i} style={{ position: "absolute", top: t === "auto" ? undefined : t, bottom: t === "auto" ? "-4px" : undefined, left: l === "auto" ? undefined : l, right: l === "auto" ? "-4px" : undefined, width: 7, height: 7, background: "var(--card)", border: "1.5px solid var(--accent)", borderRadius: 2 }} />
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", boxShadow: "0 6px 16px rgba(0,0,0,0.10)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 6px", borderRadius: 4 }}>IN PROGRESS</span>
            <span style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--font-mono)" }}>Due today</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>Design system variables</div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>V</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Vasu</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", top: 428, left: 22, width: 214, display: "flex", gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#B23A26", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>A</span>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "3px 12px 12px 12px", padding: "9px 12px", boxShadow: "0 6px 16px rgba(0,0,0,0.10)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>Aria</div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>round these corners a touch?</div>
        </div>
      </div>

      <Cursor x={168} y={150} name="Julian" color="#8a5e12" drift="lb-drift-a 7s" />
      <Cursor x={356} y={78} name="Aria" color="#B23A26" drift="lb-drift-b 6s" />
      <Cursor x={322} y={300} name="Vasu" color="#0E5C46" drift="lb-drift-c 8s" />
    </div>
  );
}
