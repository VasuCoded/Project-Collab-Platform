"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = { username: string | null; display_name: string | null; avatar_url: string | null; status_line: string | null };

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function initials(name: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

export function ProfileSettings({ userId, initial }: { userId: string; initial: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [username, setUsername] = useState(initial.username ?? "");
  const [name, setName] = useState(initial.display_name ?? "");
  const [status, setStatus] = useState(initial.status_line ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial.avatar_url);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : initial.avatar_url);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg({ ok: false, text: "Display name can't be empty." });
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setMsg({ ok: false, text: "Username must be 3–20 chars: lowercase letters, numbers, underscore." });
      return;
    }
    setBusy(true);
    setMsg(null);

    let avatar_url = initial.avatar_url;
    if (file) {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) {
        setBusy(false);
        setMsg({ ok: false, text: `Avatar upload failed: ${upErr.message}` });
        return;
      }
      avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from("profiles").update({ username, display_name: name.trim(), status_line: status.trim() || null, avatar_url }).eq("id", userId);
    setBusy(false);
    if (error) {
      const taken = error.code === "23505" || /duplicate|unique/i.test(error.message);
      setMsg({ ok: false, text: taken ? "That username is taken." : error.message });
      return;
    }
    setFile(null);
    setMsg({ ok: true, text: "Saved." });
    router.refresh(); // update the rail + anywhere your profile shows
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--background)", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 28px 64px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: "0 0 24px", fontFamily: "var(--display-font)" }}>Profile</h1>

        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {preview ? (
              <img src={preview} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
                {initials(name)}
              </div>
            )}
            <label style={{ background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)" }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-soft)" }}>
              Change avatar
              <input type="file" accept="image/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
            </label>
          </div>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Username</span>
            <div style={{ display: "flex", alignItems: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, paddingLeft: 12 }}>
              <span style={{ color: "var(--faint)", fontSize: 14 }}>@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                maxLength={20}
                placeholder="handle"
                style={{ ...field, background: "transparent", border: "none", paddingLeft: 4, outline: "none" }}
              />
            </div>
            <span style={{ display: "block", fontSize: 11, color: "var(--faint)", marginTop: 4 }}>Lowercase letters, numbers, underscore. People can DM you by this.</span>
          </label>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>What you&apos;re working on</span>
            <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="e.g. shipping the desk v2" maxLength={120} style={field} />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button type="submit" disabled={busy} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1, transition: "background-color 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.ok ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>{msg.text}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  width: "100%",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--foreground)",
  fontSize: 14,
  outline: "none",
};
