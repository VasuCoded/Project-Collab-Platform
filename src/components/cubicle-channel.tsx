"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Chat } from "@/components/chat";

type SaveState = "idle" | "saving" | "saved";

export function CubicleChannel({
  channelId,
  channelName,
  ownerName,
  isOwner,
  me,
  meName,
}: {
  channelId: string;
  channelName: string;
  ownerName: string;
  isOwner: boolean;
  me: string;
  meName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localEdit = useRef(false);

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

  useEffect(() => {
    const ch: RealtimeChannel = supabase
      .channel(`cubicle:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_notes", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const row = payload.new as { content?: string; updated_by?: string };
        if (row.updated_by === me && localEdit.current) return;
        if (typeof row.content === "string") setText(row.content);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
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
      if (error) console.error("[cubicle] save failed", error.message);
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
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>▣ {channelName}</span>
        <span style={{ fontSize: 12, color: "var(--faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {isOwner ? "your cubicle" : `${ownerName}'s cubicle`}
        </span>
        {isOwner && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
            {state === "saving" ? "saving…" : state === "saved" ? "saved" : ""}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {isOwner ? (
            <textarea
              value={text}
              onChange={(e) => onChange(e.target.value)}
              disabled={!loaded}
              placeholder={loaded ? "Your personal wall. Only you can edit this — everyone in the team can read it." : "loading…"}
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
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", color: text ? "var(--foreground)" : "var(--faint)", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-mono), ui-monospace, 'Cascadia Code', Menlo, monospace" }}>
              {loaded ? (text || `${ownerName} hasn't written anything here yet.`) : "loading…"}
            </div>
          )}
        </div>

        <aside style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--sidebar)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              Message {isOwner ? "wall" : ownerName}
            </div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
              Anyone on the team can post here.
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <Chat channelId={channelId} channelName={`${ownerName}'s wall`} me={me} meName={meName} compact />
          </div>
        </aside>
      </div>
    </div>
  );
}
