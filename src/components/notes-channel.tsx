"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type SaveState = "idle" | "saving" | "saved";

export function NotesChannel({ channelId, channelName, me }: { channelId: string; channelName: string; me: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const localEdit = useRef(false); // guards against echoing our own realtime write back over the cursor

  // Initial load.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("channel_notes").select("content").eq("channel_id", channelId).maybeSingle();
      if (!active) return;
      setText(data?.content ?? "");
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [channelId, supabase]);

  // Realtime: pull in other people's edits (but not our own).
  useEffect(() => {
    const ch = supabase
      .channel(`notes:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_notes", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const row = payload.new as { content?: string; updated_by?: string };
        if (row.updated_by === me && localEdit.current) return; // our own write echoing back
        if (typeof row.content === "string") setText(row.content);
      })
      .subscribe();
    chRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      chRef.current = null;
    };
  }, [channelId, supabase, me]);

  const flush = useCallback(
    async (value: string) => {
      setState("saving");
      const { error } = await supabase
        .from("channel_notes")
        .upsert({ channel_id: channelId, content: value, updated_at: new Date().toISOString(), updated_by: me }, { onConflict: "channel_id" });
      localEdit.current = false;
      setState(error ? "idle" : "saved");
      if (error) console.error("[notes] save failed", error.message);
    },
    [channelId, me, supabase],
  );

  function onChange(value: string) {
    setText(value);
    localEdit.current = true;
    setState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flush(value), 700);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Document metrics
  const stats = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const readTime = Math.ceil(words / 200); // 200 wpm average
    return { words, chars, readTime };
  }, [text]);

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
      {/* Premium Header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>[≡]</span>
          <span style={{
            fontFamily: "var(--display-font)",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--foreground)"
          }}>
            {channelName}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Save state tag */}
          <span style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: state === "saving" ? "var(--warning)" : state === "saved" ? "var(--success)" : "var(--muted)",
            background: state === "saving" ? "var(--warning-soft)" : state === "saved" ? "var(--success-soft)" : "var(--border-soft)",
            padding: "2px 8px",
            borderRadius: 4,
            transition: "all 0.15s ease"
          }}>
            {state === "saving" ? "Saving..." : state === "saved" ? "Saved" : "Idle"}
          </span>

          <span style={{ width: 1, height: 12, background: "var(--border)" }} />

          {/* Sync status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", textTransform: "uppercase" }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "pulse-fast 1.6s infinite"
            }} />
            Live
          </div>
        </div>
      </div>

      {/* Centered Document Card Area */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column"
      }}>
        <div style={{
          flex: 1,
          maxWidth: 800,
          width: "100%",
          margin: "0 auto",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 1px 3px var(--shadow)",
          display: "flex",
          flexDirection: "column",
          minHeight: "100%",
          overflow: "hidden"
        }}>
          <textarea
            value={text}
            onChange={(e) => onChange(e.target.value)}
            disabled={!loaded}
            placeholder={loaded ? "Start typing shared notes… everyone in this space sees updates live." : "Loading notes..."}
            spellCheck
            style={{
              flex: 1,
              width: "100%",
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--foreground)",
              fontSize: 15,
              lineHeight: 1.6,
              padding: "24px 30px",
              fontFamily: "var(--font-sans), system-ui, sans-serif",
              transition: "color 0.15s ease",
            }}
          />

          {/* Document Stats Footer */}
          <div style={{
            padding: "12px 30px",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--faint)",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            background: "var(--background)",
            opacity: loaded ? 1 : 0.5
          }}>
            <div style={{ display: "flex", gap: 16 }}>
              <span>{stats.words} {stats.words === 1 ? "word" : "words"}</span>
              <span>{stats.chars} {stats.chars === 1 ? "char" : "chars"}</span>
            </div>
            <span>{stats.readTime} min read</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-fast {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

