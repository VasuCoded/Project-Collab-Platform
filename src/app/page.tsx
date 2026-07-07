import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/queries";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Collab Platform | Modern, unified workspace for small teams",
  description: "Chat, tasks, notes, whiteboarding, docs, and voice calls — all unified in a single editorial workspace.",
};

const features: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Team chat",
    body: "Text channels with live typing indicators, online member lists, and instant image uploads. Full support for message editing and deletes.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  },
  {
    title: "Direct messages",
    body: "Message teammates directly by their @username. Instant one-on-one DMs bypass space boundaries.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 6.1H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-10a2 2 0 0 0-2-2z" />
        <path d="M23 4.1h-12a2 2 0 0 0-2 2v2" />
      </svg>
    )
  },
  {
    title: "Task boards",
    body: "A clean Kanban board for every team. Assign cards, set deadline notifications, and see what's currently blocked.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
      </svg>
    )
  },
  {
    title: "Shared notes",
    body: "Collaborative rich document editor that saves changes instantly as you type and streams updates to active editors.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  },
  {
    title: "Whiteboard",
    body: "Draw together on an infinite canvas powered by Excalidraw. Follow team member cursors and brainstorm in real-time.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    )
  },
  {
    title: "Voice and video",
    body: "Start high-fidelity audio/video calls with one click. 100% peer-to-peer, run entirely in the browser.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    )
  },
  {
    title: "Reminders",
    body: "Keep track of upcoming tasks and team timelines. Check off completed items and get notified of overdue goals.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    )
  },
  {
    title: "Embedded docs",
    body: "Embed external Google Docs, Sheets, or presentation slides directly into channel views for immediate editing.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    )
  },
  {
    title: "Private cubicle",
    body: "A dedicated personal sandbox visible only to you. Draft notes, organize tasks, and test whiteboard templates.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  },
];

export default async function Landing() {
  const user = await getCurrentUser();
  if (user) redirect("/desk"); // returning members skip the pitch

  return (
    <main style={{ background: "var(--background)", color: "var(--foreground)", minHeight: "100dvh", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease, color 0.15s ease" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 28px" }}>

        {/* Navigation Header */}
        <header className="grid-header" style={{ marginTop: 16, borderRadius: "12px", border: "1px solid var(--border)", overflow: "hidden" }}>
          <div className="grid-header-logo">
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontWeight: 700, fontSize: 13 }}>CP</div>
            <span style={{ fontWeight: 800, color: "var(--foreground)", letterSpacing: "-0.01em", fontSize: 18, fontFamily: "var(--display-font)" }}>Collab Platform</span>
          </div>
          <div className="grid-header-nav">
            <a href="#features" className="grid-header-nav-link">Features</a>
            <a href="#desk" className="grid-header-nav-link">Desk Dashboard</a>
            <a href="/login" className="grid-header-nav-link">Changelog</a>
          </div>
          <div className="grid-header-actions">
            <ThemeToggle />
            <Link href="/login" className="landing-nav-btn">
              Sign in
            </Link>
          </div>
        </header>

        {/* Hero Split Section */}
        <section className="hero-container blueprint-grid" style={{ marginTop: 24, borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden" }}>
          <div className="hero-left">
            <span className="hero-badge">v0.1.0 · Open Beta</span>
            <h1 className="hero-title">Run your team's work in one place.</h1>
            <p className="hero-desc">
              Unify chats, markdown documents, Kanban task boards, and Excalidraw whiteboards. No endless notifications thread, no generic templates. Just rapid coordination and code-friendly focus.
            </p>
            <div className="hero-cta-group">
              <Link href="/login" className="landing-btn-primary">
                Get started for free
              </Link>
            </div>
          </div>
          <div className="hero-right">
            <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 360, position: "relative" }}>
              {/* Mock Chat Card */}
              <div className="hero-mock-card" style={{ transform: "translateX(-20px)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>#dev-chat</span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>JD</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Julian D. <span style={{ fontSize: 9, fontWeight: 400 }}>10:42 AM</span></div>
                    <div style={{ fontSize: 12, color: "var(--foreground)", marginTop: 2, lineHeight: 1.4 }}>Switched color tokens to warm editorial style!</div>
                  </div>
                </div>
              </div>

              {/* Mock Task Card */}
              <div className="hero-mock-card" style={{ transform: "translateX(20px)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono), monospace", color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>IN PROGRESS</span>
                  <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>Due Today</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>☑ Design System variables</div>
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--border)" }} />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Assigned to Vasu</span>
                </div>
              </div>
            </div>
          </div>
        </section>

      {/* Infinite Marquee Section */}
      <div className="marquee-container" style={{ marginTop: 24, borderRadius: "12px", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div className="marquee-track">
          <div className="marquee-group">
            <div className="marquee-item"><span className="marquee-dot" /> PERSISTENT CHATS</div>
            <div className="marquee-item"><span className="marquee-dot" /> KANBAN TASK BOARDS</div>
            <div className="marquee-item"><span className="marquee-dot" /> EXCALIDRAW WHITEBOARD</div>
            <div className="marquee-item"><span className="marquee-dot" /> TEAM VOICE ROOMS</div>
            <div className="marquee-item"><span className="marquee-dot" /> COLLABORATIVE NOTES</div>
            <div className="marquee-item"><span className="marquee-dot" /> MARKDOWN DOCUMENTATION</div>
            <div className="marquee-item"><span className="marquee-dot" /> REAL-TIME SYNC</div>
          </div>
          <div className="marquee-group" aria-hidden="true">
            <div className="marquee-item"><span className="marquee-dot" /> PERSISTENT CHATS</div>
            <div className="marquee-item"><span className="marquee-dot" /> KANBAN TASK BOARDS</div>
            <div className="marquee-item"><span className="marquee-dot" /> EXCALIDRAW WHITEBOARD</div>
            <div className="marquee-item"><span className="marquee-dot" /> TEAM VOICE ROOMS</div>
            <div className="marquee-item"><span className="marquee-dot" /> COLLABORATIVE NOTES</div>
            <div className="marquee-item"><span className="marquee-dot" /> MARKDOWN DOCUMENTATION</div>
            <div className="marquee-item"><span className="marquee-dot" /> REAL-TIME SYNC</div>
          </div>
        </div>
      </div>

        {/* Feature Focus Block */}
        <section id="features" style={{ padding: "64px 0 64px", marginTop: 40, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 48, maxWidth: 640 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: "var(--foreground)", fontFamily: "var(--display-font)", margin: 0, letterSpacing: "-0.01em" }}>Everything your team needs, under one roof</h2>
            <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, margin: 0 }}>Each project workspace is a modular set of communication and coordination channels. Select the layouts that match your team&apos;s workflow.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {features.map((f) => (
              <div key={f.title} className="landing-card">
                <div className="landing-icon-wrapper">
                  {f.icon}
                </div>
                <h3 style={{ color: "var(--foreground)", fontSize: 18, fontWeight: 700, margin: 0 }}>{f.title}</h3>
                <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Desk Spotlight Callout */}
        <section id="desk" style={{ padding: "48px 0 64px", borderTop: "1px solid var(--border)" }}>
          <div style={{ background: "var(--sidebar)", border: "1px solid var(--border)", borderRadius: 20, padding: "40px", boxShadow: "0 8px 30px var(--shadow)", display: "flex", flexDirection: "column", gap: 20, transition: "background-color 0.15s ease" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "var(--accent)", textTransform: "uppercase" }}>Your Personal Dashboard</span>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "var(--foreground)", fontFamily: "var(--display-font)", margin: 0, letterSpacing: "-0.01em" }}>Start your day at your Desk</h2>
            <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, margin: 0, maxWidth: 760 }}>
              The Desk dashboard acts as your mission control center. It instantly aggregates all tasks assigned to you across multiple team channels, maps out upcoming dates, and highlights active conversations, so you can pick up exactly where you left off.
            </p>
          </div>
        </section>

        {/* Final call to action */}
        <section style={{ padding: "80px 0", textAlign: "center", borderTop: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 800, color: "var(--foreground)", fontFamily: "var(--display-font)", margin: 0, letterSpacing: "-0.02em" }}>Bring your team onto the same page.</h2>
          <p style={{ fontSize: 16, color: "var(--muted)", marginTop: 16, marginBottom: 32 }}>No credit card required. Invite your team and start collaborating immediately.</p>
          <div>
            <Link href="/login" className="landing-btn-primary" style={{ padding: "16px 36px", fontSize: 16 }}>
              Get started for free
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "32px 0 64px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "var(--faint)", fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--foreground)" }}>Collab Platform</span>
          </div>
          <span>Built with Next.js, Supabase, Excalidraw, and WebRTC.</span>
        </footer>
      </div>
    </main>
  );
}
