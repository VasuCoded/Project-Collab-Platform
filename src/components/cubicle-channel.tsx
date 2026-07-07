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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>[▣]</span>
          <span style={{
            fontFamily: "var(--display-font)",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--foreground)"
          }}>
            {channelName}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Owner label */}
          <span style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: isOwner ? "var(--accent)" : "var(--muted)",
            background: isOwner ? "var(--accent-soft)" : "var(--border-soft)",
            padding: "2px 8px",
            borderRadius: 4
          }}>
            {isOwner ? "Your Cubicle" : `${ownerName}'s Cubicle`}
          </span>

          {isOwner && (
            <>
              <span style={{ width: 1, height: 12, background: "var(--border)" }} />
              {/* Save status tag */}
              <span style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: state === "saving" ? "var(--warning)" : state === "saved" ? "var(--success)" : "var(--muted)"
              }}>
                {state === "saving" ? "Saving..." : state === "saved" ? "Saved" : ""}
              </span>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left Side: Personal Wall Notepad */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          padding: 24,
          overflowY: "auto"
        }}>
          <div style={{
            flex: 1,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 1px 3px var(--shadow)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "12px 20px",
              background: "var(--background)",
              borderBottom: "1px solid var(--border-soft)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em"
            }}>
              [ Scratchpad — Only {isOwner ? "you" : ownerName} can edit ]
            </div>

            {isOwner ? (
              <textarea
                value={text}
                onChange={(e) => onChange(e.target.value)}
                disabled={!loaded}
                placeholder={loaded ? "Your personal wall. Only you can edit this — everyone in the team can read it." : "Loading scratchpad..."}
                spellCheck
                style={{
                  flex: 1,
                  width: "100%",
                  resize: "none",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--foreground)",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  padding: "20px 24px",
                  fontFamily: "var(--font-sans), system-ui, sans-serif"
                }}
              />
            ) : (
              <div style={{
                flex: 1,
                padding: "20px 24px",
                color: text ? "var(--foreground)" : "var(--faint)",
                fontSize: 14.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                fontStyle: text ? "normal" : "italic"
              }}>
                {loaded ? (text || `${ownerName} hasn't written anything here yet.`) : "Loading scratchpad..."}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Messaging wall sidebar */}
        <aside style={{
          width: 340,
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--sidebar)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--foreground)",
              fontFamily: "var(--font-mono)"
            }}>
              Message {isOwner ? "Wall" : ownerName}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
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
