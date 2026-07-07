/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useUI } from "@/components/ui-provider";

type Author = { display_name: string | null; avatar_url: string | null };
type Msg = {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  edited_at: string | null;
  author_id: string;
  author: Author | null;
};

function timeOf(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

export function Chat({ channelId, channelName, me, meName, dm = false, compact = false }: { channelId: string; channelName: string; me: string; meName: string; dm?: boolean; compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const ui = useUI();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [here, setHere] = useState(1);
  const [typers, setTypers] = useState<string[]>([]);
  const [hoverMsg, setHoverMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const cache = useRef<Map<string, Author>>(new Map());
  const lastTyping = useRef(0);

  function scrollDown(smooth = false) {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  }

  // Plain, robust batch fetch — no PostgREST embeds. Resolves authors + reactions separately.
  const fetchBatch = useCallback(
    async (beforeIso?: string): Promise<Msg[]> => {
      let q = supabase.from("messages").select("id, content, image_url, created_at, edited_at, author_id").eq("channel_id", channelId);
      if (beforeIso) q = q.lt("created_at", beforeIso);
      const { data: msgs, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) {
        console.error("[chat] messages fetch failed", error.message);
        return [];
      }
      const rows = ((msgs ?? []) as { id: string; content: string; image_url: string | null; created_at: string; edited_at: string | null; author_id: string }[]).slice().reverse();
      if (rows.length === 0) return [];

      const needAuthors = [...new Set(rows.map((r) => r.author_id))].filter((id) => !cache.current.has(id));
      if (needAuthors.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", needAuthors);
        (profs ?? []).forEach((p) => cache.current.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url }));
      }

      return rows.map((r) => ({ ...r, author: cache.current.get(r.author_id) ?? null }));
    },
    [channelId, supabase],
  );

  useEffect(() => {
    let active = true;
    setMessages([]);
    (async () => {
      const batch = await fetchBatch();
      if (!active) return;
      setMessages(batch);
      setHasMore(batch.length === 50);
      scrollDown();
    })();
    return () => {
      active = false;
    };
  }, [fetchBatch]);

  const markRead = useCallback(() => {
    void supabase.rpc("mark_channel_read", { p_channel_id: channelId });
  }, [channelId, supabase]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  useEffect(() => {
    const ch = supabase.channel(`chat:${channelId}`, { config: { presence: { key: me } } });
    chRef.current = ch;

    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, async (payload) => {
      const row = payload.new as { id: string; content: string; image_url: string | null; created_at: string; edited_at: string | null; author_id: string };
      let author = cache.current.get(row.author_id) ?? null;
      if (!author) {
        const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", row.author_id).single();
        author = data ?? { display_name: "Someone", avatar_url: null };
        cache.current.set(row.author_id, author);
      }
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, author }]));
      scrollDown(true);
      if (row.author_id !== me) markRead(); // we're looking at it, so keep it read
    });

    ch.on("presence", { event: "sync" }, () => setHere(Object.keys(ch.presenceState()).length || 1));

    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const n = String(payload?.name || "");
      if (!n || payload?.userId === me) return;
      setTypers((prev) => (prev.includes(n) ? prev : [...prev, n]));
      window.setTimeout(() => setTypers((prev) => prev.filter((x) => x !== n)), 3000);
    });

    // A peer deleted one of their messages — drop it live. (Broadcast rather than
    // a DELETE postgres_changes so it works without REPLICA IDENTITY FULL.)
    ch.on("broadcast", { event: "msgdelete" }, ({ payload }) => {
      const id = payload?.id as string | undefined;
      if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    // A peer edited one of their messages — update it live.
    ch.on("broadcast", { event: "msgedit" }, ({ payload }) => {
      const { id, content, edited_at } = (payload ?? {}) as { id?: string; content?: string; edited_at?: string };
      if (id) setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: content ?? m.content, edited_at: edited_at ?? m.edited_at } : m)));
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ at: Date.now() });
    });

    return () => {
      supabase.removeChannel(ch);
      chRef.current = null;
    };
  }, [channelId, me, supabase, markRead]);

  async function loadOlder() {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const older = await fetchBatch(messages[0].created_at);
    setMessages((prev) => [...older, ...prev]);
    setHasMore(older.length === 50);
    setLoadingOlder(false);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH;
    });
  }

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTyping.current > 1500) {
      lastTyping.current = now;
      chRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: me, name: meName } });
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if ((!content && !file) || sending) return;
    setSending(true);
    let image_url: string | null = null;
    if (file) {
      const path = `${channelId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("chat-images").upload(path, file);
      if (upErr) {
        ui.alert(`Image upload failed: ${upErr.message}`, 'Upload Error');
        setSending(false);
        return;
      }
      image_url = supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("messages").insert({ channel_id: channelId, author_id: me, content, image_url });
    setSending(false);
    if (error) {
      ui.alert(error.message, 'Error');
      return;
    }
    setText("");
    setFile(null);
  }

  async function deleteMessage(id: string) {
    const before = messages;
    setMessages((prev) => prev.filter((m) => m.id !== id)); // optimistic
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) {
      setMessages(before); // roll back
      ui.alert(error.message, 'Error');
      return;
    }
    chRef.current?.send({ type: "broadcast", event: "msgdelete", payload: { id } });
  }

  function startEdit(m: Msg) {
    setEditingId(m.id);
    setEditText(m.content);
  }

  async function saveEdit(id: string) {
    const content = editText.trim();
    const original = messages.find((m) => m.id === id);
    if (!original || !content || content === original.content) {
      setEditingId(null);
      return;
    }
    const edited_at = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, edited_at } : m))); // optimistic
    setEditingId(null);
    const { error } = await supabase.from("messages").update({ content, edited_at }).eq("id", id);
    if (error) {
      setMessages((prev) => prev.map((m) => (m.id === id ? original : m))); // roll back
      ui.alert(error.message, 'Error');
      return;
    }
    chRef.current?.send({ type: "broadcast", event: "msgedit", payload: { id, content, edited_at } });
  }

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minWidth: 0,
      fontFamily: "var(--font-sans)",
      background: "var(--background)",
      transition: "background-color 0.15s ease"
    }}>
      {/* Header Bar */}
      {!compact && (
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>
              {dm ? "[DM]" : "[#]"}
            </span>
            <span style={{
              fontFamily: "var(--display-font)",
              fontSize: 18,
              fontWeight: 800,
              color: "var(--foreground)"
            }}>
              {channelName}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", textTransform: "uppercase" }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "pulse-fast 1.8s infinite"
            }} />
            {here} active
          </div>
        </div>
      )}

      {/* Messages List Viewport */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: compact ? "16px" : "24px" }}>
        {hasMore && (
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            style={{
              display: "block",
              margin: "0 auto 16px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              borderRadius: 6,
              padding: "5px 14px",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--border-soft)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--card)"}
          >
            {loadingOlder ? "loading..." : "load older messages"}
          </button>
        )}

        {messages.length === 0 && (
          <div style={{ color: "var(--faint)", textAlign: "center", marginTop: 48, fontSize: 14, fontFamily: "var(--font-mono)" }}>
            [ no messages yet. say hi 👋 ]
          </div>
        )}

        {/* Message bubble rows */}
        {messages.map((m) => (
          <div
            key={m.id}
            onMouseEnter={() => setHoverMsg(m.id)}
            onMouseLeave={() => setHoverMsg((h) => (h === m.id ? null : h))}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 8,
              alignItems: "flex-start",
              background: hoverMsg === m.id ? "var(--border-soft)" : "transparent",
              transition: "background 0.12s ease",
              position: "relative",
              marginBottom: 4
            }}
          >
            {/* Avatar image or initials badge */}
            {m.author?.avatar_url ? (
              <img src={m.author.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid var(--border)" }} />
            ) : (
              <div style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
                border: "1px solid rgba(14, 92, 70, 0.1)"
              }}>
                {(m.author?.display_name ?? "?").trim().slice(0, 2).toUpperCase() || "?"}
              </div>
            )}

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <b style={{ color: "var(--foreground)", fontSize: 14, fontWeight: 700 }}>
                  {m.author?.display_name ?? "Someone"}
                </b>
                <span style={{ color: "var(--faint)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {timeOf(m.created_at)}
                </span>
              </div>

              {/* Editing view */}
              {editingId === m.id ? (
                <div style={{ marginTop: 6 }}>
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit(m.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    rows={2}
                    style={{
                      width: "100%",
                      background: "var(--background)",
                      border: "1px solid var(--accent)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      color: "var(--foreground)",
                      fontSize: 14,
                      resize: "vertical",
                      fontFamily: "inherit",
                      outline: "none"
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                    <button
                      onClick={() => saveEdit(m.id)}
                      style={{
                        background: "var(--accent)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "3px 10px",
                        cursor: "pointer",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        fontWeight: 700,
                        textTransform: "uppercase"
                      }}
                    >
                      Cancel
                    </button>
                    <span style={{ color: "var(--faint)", marginLeft: "auto" }}>
                      Enter to save · Esc to cancel
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {m.content && (
                    <div style={{
                      color: "var(--foreground)",
                      fontSize: 14.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.5,
                      marginTop: 2
                    }}>
                      {m.content}
                      {m.edited_at && (
                        <span style={{
                          color: "var(--faint)",
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          marginLeft: 6
                        }}>
                          (EDITED)
                        </span>
                      )}
                    </div>
                  )}
                  {m.image_url && (
                    <img
                      src={m.image_url}
                      alt=""
                      style={{
                        maxWidth: 320,
                        maxHeight: 320,
                        borderRadius: 10,
                        marginTop: 6,
                        display: "block",
                        border: "1px solid var(--border)"
                      }}
                    />
                  )}
                </>
              )}
            </div>

            {/* Hover Actions Float Overlay */}
            {m.author_id === me && hoverMsg === m.id && editingId !== m.id && (
              <div style={{
                display: "flex",
                gap: 2,
                position: "absolute",
                right: 12,
                top: 8,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "2px",
                boxShadow: "0 2px 8px var(--shadow)",
                zIndex: 10
              }}>
                {m.content && (
                  <button
                    onClick={() => startEdit(m)}
                    title="Edit message"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 14,
                      width: 26,
                      height: 26,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--border-soft)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "transparent"; }}
                  >
                    ✎
                  </button>
                )}
                <button
                  onClick={() => deleteMessage(m.id)}
                  title="Delete message"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: 14,
                    width: 26,
                    height: 26,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-soft)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "transparent"; }}
                >
                  🗑
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Typing indicators */}
      <div style={{
        minHeight: 18,
        padding: "0 24px",
        color: "var(--muted)",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.03em"
      }}>
        {typers.length > 0 && `[ ${typers.join(", ")} ${typers.length === 1 ? "is" : "are"} typing... ]`}
      </div>

      {/* Attachments preview */}
      {file && (
        <div style={{
          padding: "6px 12px",
          margin: "0 24px 8px",
          background: "var(--accent-soft)",
          border: "1px solid rgba(14, 92, 70, 0.15)",
          borderRadius: 6,
          color: "var(--accent)",
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
          width: "fit-content",
          display: "flex",
          alignItems: "center",
          gap: 6
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{file.name}</span>
          <button
            onClick={() => setFile(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--danger)",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              padding: "0 2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={send} style={{
        display: "flex",
        gap: compact ? 8 : 12,
        padding: compact ? "12px 14px" : "16px 24px",
        borderTop: "1px solid var(--border)",
        alignItems: "center",
        background: "var(--card)",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder={dm ? `Message ${channelName}...` : `Message #${channelName}...`}
          style={{
            flex: 1,
            minWidth: 0,
            width: "100%",
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: compact ? "8px 12px" : "10px 14px",
            color: "var(--foreground)",
            fontSize: 14,
            outline: "none",
            transition: "border-color 0.15s ease"
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
          onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
        />

        {/* Attachment button */}
        <label
          style={{
            color: "var(--muted)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            width: compact ? 32 : 36,
            height: compact ? 32 : 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--background)",
            flexShrink: 0
          }}
          title="Attach Image"
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
        >
          <svg width={compact ? 16 : 20} height={compact ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
        </label>

        {/* Send Button */}
        <button
          type="submit"
          disabled={sending || (!text.trim() && !file)}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: compact ? "8px 12px" : "10px 18px",
            cursor: (sending || (!text.trim() && !file)) ? "default" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            opacity: (sending || (!text.trim() && !file)) ? 0.6 : 1,
            transition: "background-color 0.15s ease",
            flexShrink: 0
          }}
          onMouseEnter={(e) => { if (!sending && (text.trim() || file)) e.currentTarget.style.background = "var(--accent-hover)" }}
          onMouseLeave={(e) => { if (!sending && (text.trim() || file)) e.currentTarget.style.background = "var(--accent)" }}
        >
          {sending ? "Sending" : "Send"}
        </button>
      </form>

      <style>{`
        @keyframes pulse-fast {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
