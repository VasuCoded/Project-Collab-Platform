"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import "@excalidraw/excalidraw/index.css";

type El = { id: string; version?: number; isDeleted?: boolean; [k: string]: unknown };
type Collaborator = { username?: string; pointer?: { x: number; y: number }; color?: { background: string; stroke: string } };
type ExcalidrawApi = {
  updateScene: (scene: { elements?: readonly El[]; collaborators?: Map<string, Collaborator> }) => void;
  getSceneElements: () => readonly El[];
};
type ExcalidrawProps = {
  excalidrawAPI?: (api: ExcalidrawApi) => void;
  initialData?: { elements?: readonly El[]; scrollToContent?: boolean } | null;
  onChange?: (elements: readonly El[]) => void;
  onPointerUpdate?: (p: { pointer: { x: number; y: number } }) => void;
  isCollaborating?: boolean;
  theme?: "light" | "dark";
};

// Excalidraw touches window/document, so it can only load on the client.
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw as unknown as ComponentType<ExcalidrawProps>),
  {
    ssr: false,
    loading: () => (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", background: "var(--background)" }}>
        Loading canvas…
      </div>
    ),
  },
);

const COLORS = ["#e0554c", "#4f46e5", "#0ea5e9", "#22c55e", "#eab308", "#ec4899"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function Whiteboard({ channelId, channelName, me, meName }: { channelId: string; channelName: string; me: string; meName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [here, setHere] = useState(1);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Sync theme with HTML data-theme attribute
  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = (document.documentElement.getAttribute('data-theme') || 'light') as 'light' | 'dark';
      setTheme(currentTheme);
    };
    updateTheme();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          updateTheme();
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const initialElements = useRef<readonly El[]>([]);
  const apiRef = useRef<ExcalidrawApi | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const collaborators = useRef<Map<string, Collaborator>>(new Map());
  const applyingRemote = useRef(false);
  const lastScene = useRef(0);
  const lastPointer = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestElements = useRef<readonly El[]>([]);
  const sceneTrail = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the persisted scene once, then mount the canvas with it.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("whiteboards").select("elements").eq("channel_id", channelId).maybeSingle();
      if (!active) return;
      initialElements.current = (data?.elements as El[] | undefined) ?? [];
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [channelId, supabase]);

  // Realtime: broadcast the scene and pointers; presence drives the "N here" count.
  useEffect(() => {
    const ch = supabase.channel(`wb:${channelId}`, { config: { presence: { key: me }, broadcast: { self: false } } });
    chRef.current = ch;

    ch.on("broadcast", { event: "scene" }, ({ payload }) => {
      const api = apiRef.current;
      if (!api || !payload?.elements) return;
      applyingRemote.current = true;
      api.updateScene({ elements: payload.elements as El[] });
      window.setTimeout(() => {
        applyingRemote.current = false;
      }, 60);
    });

    ch.on("broadcast", { event: "pointer" }, ({ payload }) => {
      const api = apiRef.current;
      if (!api || !payload || payload.userId === me) return;
      collaborators.current.set(payload.userId, {
        username: payload.name,
        pointer: { x: payload.x, y: payload.y },
        color: { background: colorFor(payload.userId), stroke: colorFor(payload.userId) },
      });
      api.updateScene({ collaborators: new Map(collaborators.current) });
    });

    ch.on("presence", { event: "sync" }, () => setHere(Object.keys(ch.presenceState()).length || 1));
    ch.on("presence", { event: "leave" }, ({ key }) => {
      if (key && collaborators.current.delete(key)) apiRef.current?.updateScene({ collaborators: new Map(collaborators.current) });
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ at: Date.now(), name: meName });
    });

    return () => {
      supabase.removeChannel(ch);
      chRef.current = null;
    };
  }, [channelId, me, meName, supabase]);

  // Flush the persist + trailing-scene timers when leaving the board.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (sceneTrail.current) clearTimeout(sceneTrail.current);
    };
  }, []);

  function persist(elements: readonly El[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from("whiteboards")
        .upsert({ channel_id: channelId, elements, updated_at: new Date().toISOString(), updated_by: me })
        .then(({ error }) => {
          if (error) console.error("[whiteboard] persist failed", error.message);
        });
    }, 800);
  }

  function broadcastScene(elements: readonly El[]) {
    lastScene.current = Date.now();
    chRef.current?.send({ type: "broadcast", event: "scene", payload: { elements } });
  }

  function onChange(elements: readonly El[]) {
    if (applyingRemote.current) return; // don't echo a remote update back out
    latestElements.current = elements;
    const now = Date.now();
    if (now - lastScene.current > 90) {
      broadcastScene(elements);
    } else {
      // Throttled out — schedule a trailing send so the final frame of a stroke
      // always reaches other viewers instead of being dropped until they reload.
      if (sceneTrail.current) clearTimeout(sceneTrail.current);
      sceneTrail.current = setTimeout(() => broadcastScene(latestElements.current), 120);
    }
    persist(elements);
  }

  function onPointerUpdate(p: { pointer: { x: number; y: number } }) {
    const now = Date.now();
    if (now - lastPointer.current < 55) return;
    lastPointer.current = now;
    chRef.current?.send({ type: "broadcast", event: "pointer", payload: { userId: me, name: meName, x: p.pointer.x, y: p.pointer.y } });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "var(--background)", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>&#128393; {channelName}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{here} here &middot; live</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {ready && (
          <Excalidraw
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={{ elements: initialElements.current, scrollToContent: true }}
            onChange={onChange}
            onPointerUpdate={onPointerUpdate}
            isCollaborating
            theme={theme}
          />
        )}
      </div>
    </div>
  );
}
