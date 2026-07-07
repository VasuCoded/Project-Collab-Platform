"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Preview = { name: string; members: number };
type State =
  | { kind: "loading" }
  | { kind: "ready"; preview: Preview | null }
  | { kind: "joining" }
  | { kind: "error"; message: string };

function initials(name: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data, error } = await supabase.rpc("invite_preview", { p_code: code });
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setState({ kind: "ready", preview: null });
        return;
      }
      if (row.status === "expired") return setState({ kind: "error", message: "This invite has expired." });
      if (row.status === "exhausted") return setState({ kind: "error", message: "This invite has been used up." });
      if (row.status === "invalid") return setState({ kind: "error", message: "This invite link is invalid." });
      setState({ kind: "ready", preview: { name: row.space_name ?? "a team", members: Number(row.member_count) || 0 } });
    })();
    return () => { active = false; };
  }, [code, supabase]);

  async function accept() {
    setState({ kind: "joining" });
    const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });
    if (error) {
      const m = error.message || "";
      setState({
        kind: "error",
        message: m.includes("expired") ? "This invite has expired."
          : m.includes("exhausted") ? "This invite has been used up."
          : m.includes("not_found") ? "This invite link is invalid."
          : "Couldn't join. Try again.",
      });
      return;
    }
    window.location.href = `/${data}`;
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)", fontFamily: "var(--font-sans)", color: "var(--foreground)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 32, boxShadow: "0 24px 60px var(--shadow)", textAlign: "center" }}>
        <Link href="/" title="Home" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", marginBottom: 24 }}>
          <span style={{ width: 26, height: 26, borderRadius: 6, background: "var(--accent)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>CP</span>
          <span style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--display-font)", color: "var(--foreground)" }}>Collab Platform</span>
        </Link>

        {state.kind === "loading" && (
          <div style={{ color: "var(--muted)", fontSize: 14, fontFamily: "var(--font-mono)", padding: "20px 0" }}>Checking invite…</div>
        )}

        {state.kind === "error" && (
          <>
            <h1 style={{ fontFamily: "var(--display-font)", fontSize: 24, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Can&apos;t join</h1>
            <p style={{ color: "var(--danger)", fontSize: 14, margin: "0 0 24px" }}>{state.message}</p>
            <Link href="/desk" style={{ color: "var(--accent)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Go to your desk</Link>
          </>
        )}

        {(state.kind === "ready" || state.kind === "joining") && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, fontFamily: "var(--display-font)", margin: "0 auto 18px", border: "1px solid var(--border)" }}>
              {state.kind === "ready" && state.preview ? initials(state.preview.name) : "#"}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>You&apos;ve been invited to join</div>
            <h1 style={{ fontFamily: "var(--display-font)", fontSize: 26, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              {state.kind === "ready" && state.preview ? state.preview.name : "a team"}
            </h1>
            {state.kind === "ready" && state.preview && state.preview.members > 0 ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }} />
                {state.preview.members} {state.preview.members === 1 ? "member" : "members"}
              </div>
            ) : (
              <div style={{ height: 24 }} />
            )}

            <button
              onClick={accept}
              disabled={state.kind === "joining"}
              style={{ width: "100%", padding: "12px 24px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: state.kind === "joining" ? "not-allowed" : "pointer", transition: "background-color 0.15s ease", fontFamily: "var(--font-sans)" }}
              onMouseEnter={(e) => { if (state.kind !== "joining") e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
            >
              {state.kind === "joining" ? "Joining…" : "Accept invite"}
            </button>
            <div style={{ marginTop: 14 }}>
              <Link href="/desk" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}>Not now</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
