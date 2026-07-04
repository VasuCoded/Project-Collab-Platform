"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

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
      alert(error.message);
      return;
    }
    setUrl(value || null);
    setEditing(false);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "#0a0a0a", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #262626", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "#fff" }}>▤ {channelName}</span>
        {url && canManage && !editing && (
          <button onClick={() => { setDraft(url); setEditing(true); }} style={{ marginLeft: "auto", background: "none", border: "1px solid #333", color: "#aaa", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>
            change link
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {canManage ? (
            <form onSubmit={save} style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "#ddd", fontSize: 15, fontWeight: 600 }}>Embed a document</div>
              <div style={{ color: "#888", fontSize: 13, lineHeight: 1.5 }}>
                Paste a Google Docs, Sheets, or Slides share link (set to &ldquo;anyone with the link can view&rdquo;), or any embeddable URL.
              </div>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://docs.google.com/…"
                style={{ background: "#141414", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", color: "#ededed", fontSize: 14 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={saving || !draft.trim()} style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 14, opacity: saving || !draft.trim() ? 0.6 : 1 }}>
                  {saving ? "saving…" : "Embed"}
                </button>
                {url && (
                  <button type="button" onClick={() => setEditing(false)} style={{ background: "none", border: "1px solid #333", color: "#aaa", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 14 }}>
                    cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div style={{ color: "#888", fontSize: 14, textAlign: "center" }}>No document has been embedded yet. An admin can add one.</div>
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
