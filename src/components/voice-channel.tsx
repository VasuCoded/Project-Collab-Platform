"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useUI } from "@/components/ui-provider";

// Serverless voice/video: a full-mesh of RTCPeerConnections with Supabase
// Realtime (broadcast + presence) as the signaling channel. No media server, no
// API keys — each participant connects directly to every other. Great for small
// teams; a mesh gets heavy past ~5-6 people (that's when you'd want an SFU).

type Peer = { id: string; name: string; stream: MediaStream | null };

// Public STUN handles most home networks. A TURN server (relay) is needed for
// peers behind strict/symmetric NATs (different networks, some mobile). Provide
// one via env and it's used automatically — otherwise we run STUN-only.
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((s) => s.trim()).filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

const ICE: RTCConfiguration = { iceServers: iceServers() };

function initials(name: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

function Tile({ name, stream, muted, you }: { name: string; stream: MediaStream | null; muted?: boolean; you?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div style={{ position: "relative", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", aspectRatio: "16 / 10", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px var(--shadow)" }}>
      <video ref={ref} autoPlay playsInline muted={muted} style={{ width: "100%", height: "100%", objectFit: "cover", display: hasVideo ? "block" : "none" }} />
      {!hasVideo && (
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>{initials(name)}</div>
      )}
      <span style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>
        {name}
        {you ? " (you)" : ""}
      </span>
    </div>
  );
}

export function VoiceChannel({ channelId, channelName, me, meName }: { channelId: string; channelName: string; me: string; meName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const ui = useUI();
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localRef = useRef<MediaStream | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const names = useRef<Map<string, string>>(new Map());

  const setPeerStream = useCallback((id: string, stream: MediaStream) => {
    setPeers((prev) => {
      const name = names.current.get(id) ?? "Someone";
      const i = prev.findIndex((p) => p.id === id);
      if (i === -1) return [...prev, { id, name, stream }];
      const copy = prev.slice();
      copy[i] = { ...copy[i], name, stream };
      return copy;
    });
  }, []);

  const signal = useCallback((to: string, kind: string, data: unknown) => {
    chRef.current?.send({ type: "broadcast", event: "signal", payload: { from: me, to, kind, data } });
  }, [me]);

  const makePeer = useCallback(
    (peerId: string, initiator: boolean) => {
      const pc = new RTCPeerConnection(ICE);
      pcs.current.set(peerId, pc);
      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) signal(peerId, "ice", e.candidate.toJSON());
      };
      pc.ontrack = (e) => setPeerStream(peerId, e.streams[0]);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          pcs.current.delete(peerId);
          setPeers((prev) => prev.filter((p) => p.id !== peerId));
        }
      };
      if (initiator) {
        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signal(peerId, "offer", offer);
          } catch {
            /* ignore transient negotiation errors */
          }
        };
      }
      return pc;
    },
    [signal, setPeerStream],
  );

  const drainIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const q = pendingIce.current.get(peerId);
    if (!q) return;
    for (const c of q) await pc.addIceCandidate(c).catch(() => {});
    pendingIce.current.delete(peerId);
  }, []);

  const leave = useCallback(() => {
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    pendingIce.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (chRef.current) supabase.removeChannel(chRef.current);
    chRef.current = null;
    setPeers([]);
    setLocalStream(null);
    setJoined(false);
  }, [supabase]);

  async function join(withCam: boolean) {
    if (connecting || joined) return;
    setConnecting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withCam });
    } catch (e) {
      setConnecting(false);
      ui.alert(e instanceof Error ? `Could not access mic/camera: ${e.message}` : "Could not access mic/camera", 'Media Error');
      return;
    }
    localRef.current = stream;
    setLocalStream(stream);
    setMicOn(true);
    setCamOn(withCam);

    const ch = supabase.channel(`rtc:${channelId}`, { config: { presence: { key: me }, broadcast: { self: false } } });
    chRef.current = ch;

    ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (!payload || payload.to !== me) return;
      const from = payload.from as string;
      if (payload.kind === "offer") {
        const pc = pcs.current.get(from) ?? makePeer(from, false);
        await pc.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
        await drainIce(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal(from, "answer", answer);
      } else if (payload.kind === "answer") {
        const pc = pcs.current.get(from);
        if (pc) {
          await pc.setRemoteDescription(payload.data as RTCSessionDescriptionInit);
          await drainIce(from, pc);
        }
      } else if (payload.kind === "ice") {
        const pc = pcs.current.get(from);
        const cand = payload.data as RTCIceCandidateInit;
        if (pc && pc.remoteDescription) await pc.addIceCandidate(cand).catch(() => {});
        else pendingIce.current.set(from, [...(pendingIce.current.get(from) ?? []), cand]);
      }
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, { name?: string }[]>;
      const present = new Set(Object.keys(state));
      for (const [id, metas] of Object.entries(state)) names.current.set(id, metas[0]?.name ?? "Someone");
      // Connect to any new peer; the lexicographically-smaller id initiates to avoid glare.
      for (const id of present) {
        if (id === me || pcs.current.has(id)) continue;
        if (me < id) makePeer(id, true);
      }
      // Drop peers who left.
      for (const id of [...pcs.current.keys()]) {
        if (!present.has(id)) {
          pcs.current.get(id)?.close();
          pcs.current.delete(id);
          setPeers((prev) => prev.filter((p) => p.id !== id));
        }
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ name: meName });
    });
    setConnecting(false);
    setJoined(true);
  }

  useEffect(() => () => leave(), [leave]); // hang up when leaving the channel

  function toggleMic() {
    const on = !micOn;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = on));
    setMicOn(on);
  }
  function toggleCam() {
    const on = !camOn;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = on));
    setCamOn(on);
    if (localRef.current) setLocalStream(new MediaStream(localRef.current.getTracks())); // nudge tile re-render
  }

  const hasCamTrack = !!localStream?.getVideoTracks().length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "var(--background)", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>🔊 {channelName}</span>
        {joined && <span style={{ fontSize: 12, color: "var(--muted)" }}>{peers.length + 1} in call</span>}
      </div>

      {!joined ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ color: "var(--foreground)", fontSize: 16, fontWeight: 600 }}>Ready to join {channelName}?</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => join(false)} disabled={connecting} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, cursor: "pointer", fontWeight: 600, transition: "background-color 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}>
              {connecting ? "…" : "Join with mic"}
            </button>
            <button onClick={() => join(true)} disabled={connecting} style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 20px", fontSize: 14, cursor: "pointer", fontWeight: 600, transition: "all 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--border)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent-soft)"}>
              Join with camera
            </button>
          </div>
          <div style={{ color: "var(--faint)", fontSize: 12 }}>Peer-to-peer · best for small groups</div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflow: "auto", padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, alignContent: "start" }}>
            <Tile name={meName} stream={localStream} muted you />
            {peers.map((p) => (
              <Tile key={p.id} name={p.name} stream={p.stream} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
            <button onClick={toggleMic} style={ctlBtn(micOn)}>{micOn ? "🎙 Mute" : "🔇 Unmute"}</button>
            {hasCamTrack && <button onClick={toggleCam} style={ctlBtn(camOn)}>{camOn ? "📷 Camera off" : "📷 Camera on"}</button>}
            <button onClick={leave} style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, cursor: "pointer", fontWeight: 600, transition: "background-color 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--danger)"}>
              Leave
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ctlBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--accent-soft)" : "var(--border-soft)",
    color: active ? "var(--accent)" : "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.15s ease",
  };
}
