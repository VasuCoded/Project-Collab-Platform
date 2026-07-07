"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUI } from "@/components/ui-provider";

// Turn a normal Google Docs/Sheets/Slides share link into an embeddable one, so
// pasting the URL from the address bar just works. Anything else is used as-is.
function toEmbed(raw: string): string {
  const url = raw.trim();
  const g = url.match(/^(https:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/[^/]+)/);
  if (g) {
    const base = g[1];
    if (url.includes("/presentation/")) return `${base}/embed`;
    return `${base}/preview`;
  }
  return url;
}

export function DocsChannel({ channelId, channelName, embedUrl, canManage }: { channelId: string; channelName: string; embedUrl: string | null; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const ui = useUI();
  const [url, setUrl] = useState<string | null>(embedUrl);
  const [editing, setEditing] = useState(!embedUrl);
  const [draft, setDraft] = useState(embedUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.from("channels").update({ embed_url: value || null }).eq("id", channelId);
    setSaving(false);
    if (error) {
      ui.alert(error.message, 'Error');
      return;
    }
    ui.toast('Document link saved!', 'success');
    setUrl(value || null);
    setEditing(false);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "var(--background)", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>▤ {channelName}</span>
        {url && canManage && !editing && (
          <button onClick={() => { setDraft(url); setEditing(true); }} style={{ marginLeft: "auto", background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", transition: "all 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--border-soft)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--card)"}>
            change link
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {canManage ? (
            <form onSubmit={save} style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "var(--foreground)", fontSize: 15, fontWeight: 600 }}>Embed a document</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Paste a Google Docs, Sheets, or Slides share link (set to &ldquo;anyone with the link can view&rdquo;), or any embeddable URL.
              </div>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://docs.google.com/…"
                style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--foreground)", fontSize: 14, outline: "none" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={saving || !draft.trim()} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, opacity: saving || !draft.trim() ? 0.6 : 1, transition: "background-color 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}>
                  {saving ? "saving…" : "Embed"}
                </button>
                {url && (
                  <button type="button" onClick={() => setEditing(false)} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 14 }}>
                    cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 14, textAlign: "center" }}>No document has been embedded yet. An admin can add one.</div>
          )}
        </div>
      ) : (
        <iframe
          key={url ?? ""}
          src={url ? toEmbed(url) : undefined}
          title={channelName}
          style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      )}
    </div>
  );
}
