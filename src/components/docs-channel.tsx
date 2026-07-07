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
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minWidth: 0,
      background: "var(--background)",
      fontFamily: "var(--font-sans)",
      transition: "background-color 0.15s ease"
    }}>
      {/* Header bar */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>[▤]</span>
          <span style={{
            fontFamily: "var(--display-font)",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--foreground)"
          }}>
            {channelName}
          </span>
        </div>

        {url && canManage && !editing && (
          <button
            onClick={() => { setDraft(url); setEditing(true); }}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--border-soft)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--card)"}
          >
            Change Link
          </button>
        )}
      </div>

      {editing ? (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24
        }}>
          {canManage ? (
            <div style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 1px 3px var(--shadow)",
              padding: "36px 40px",
              maxWidth: 540,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 16
            }}>
              <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>[EMBED]</span>
                  <h3 style={{
                    fontFamily: "var(--display-font)",
                    fontSize: 20,
                    fontWeight: 800,
                    color: "var(--foreground)",
                    margin: 0
                  }}>
                    Embed a Document
                  </h3>
                </div>

                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  Paste a Google Docs, Sheets, or Slides share link (ensure sharing permissions are set to &ldquo;anyone with the link can view&rdquo;), or any other embeddable URL.
                </p>

                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  style={{
                    width: "100%",
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "var(--foreground)",
                    fontSize: 13.5,
                    outline: "none",
                    transition: "border-color 0.15s ease",
                    fontFamily: "var(--font-mono)"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                />

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    type="submit"
                    disabled={saving || !draft.trim()}
                    style={{
                      flex: 1,
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      cursor: (saving || !draft.trim()) ? "default" : "pointer",
                      opacity: (saving || !draft.trim()) ? 0.6 : 1,
                      transition: "background-color 0.15s ease"
                    }}
                    onMouseEnter={(e) => { if (!saving && draft.trim()) e.currentTarget.style.background = "var(--accent-hover)" }}
                    onMouseLeave={(e) => { if (!saving && draft.trim()) e.currentTarget.style.background = "var(--accent)" }}
                  >
                    {saving ? "Saving..." : "Embed Link"}
                  </button>
                  {url && (
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      style={{
                        background: "var(--border-soft)",
                        border: "1px solid var(--border)",
                        color: "var(--foreground)",
                        borderRadius: 8,
                        padding: "10px 20px",
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--border)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "var(--border-soft)"}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 14, fontSize: 11, color: "var(--faint)", lineHeight: 1.4 }}>
                <strong>Tip:</strong> In Google Docs, click the <em>Share</em> button at the top right, change General Access to <em>Anyone with the link</em>, copy the link, and paste it here.
              </div>
            </div>
          ) : (
            <div style={{
              background: "var(--card)",
              border: "1px dashed var(--border)",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              maxWidth: 400,
              color: "var(--muted)",
              fontSize: 14
            }}>
              No document has been embedded yet. Please ask an administrator or owner to configure this channel link.
            </div>
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
