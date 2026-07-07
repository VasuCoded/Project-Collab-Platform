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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "var(--background)", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>≡ {channelName}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : ""}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={!loaded}
        placeholder={loaded ? "Start typing shared notes… everyone in this space sees them live." : "loading…"}
        spellCheck
        style={{
          flex: 1,
          width: "100%",
          resize: "none",
          border: "none",
          outline: "none",
          background: "var(--background)",
          color: "var(--foreground)",
          fontSize: 15,
          lineHeight: 1.6,
          padding: "18px 22px",
          fontFamily: "var(--font-mono), ui-monospace, 'Cascadia Code', Menlo, monospace",
          transition: "background-color 0.15s ease, color 0.15s ease",
        }}
      />
    </div>
  );
}
