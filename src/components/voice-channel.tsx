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
    <div style={{
      position: "relative",
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      overflow: "hidden",
      aspectRatio: "16 / 10",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 1px 3px var(--shadow)",
      transition: "all 0.2s ease"
    }}>
      <video ref={ref} autoPlay playsInline muted={muted} style={{ width: "100%", height: "100%", objectFit: "cover", display: hasVideo ? "block" : "none" }} />
      {!hasVideo && (
        <div style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--accent-soft)",
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          border: "1px solid rgba(14, 92, 70, 0.1)"
        }}>
          {initials(name)}
        </div>
      )}
      <span style={{
        position: "absolute",
        left: 10,
        bottom: 10,
        background: "rgba(15, 17, 15, 0.75)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 6,
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.03em"
      }}>
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>[🔊]</span>
          <span style={{
            fontFamily: "var(--display-font)",
            fontSize: 18,
            fontWeight: 800,
            color: "var(--foreground)"
          }}>
            {channelName}
          </span>
        </div>

        {joined && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", textTransform: "uppercase" }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--success)",
              animation: "pulse-fast 1.8s infinite"
            }} />
            {peers.length + 1} connected
          </div>
        )}
      </div>

      {!joined ? (
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24
        }}>
          {/* Lobby Join Card */}
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 1px 3px var(--shadow)",
            padding: "36px 40px",
            textAlign: "center",
            maxWidth: 440,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </div>
            <div>
              <h3 style={{
                fontFamily: "var(--display-font)",
                fontSize: 20,
                fontWeight: 800,
                color: "var(--foreground)",
                margin: 0
              }}>
                Ready to Join?
              </h3>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0 0", lineHeight: 1.4 }}>
                Enter the voice channel &ldquo;{channelName}&rdquo; to start speaking with other active team members.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
              <button
                onClick={() => join(false)}
                disabled={connecting}
                style={{
                  flex: 1,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  transition: "background-color 0.15s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}
              >
                {connecting ? "Connecting..." : "Voice Only"}
              </button>
              <button
                onClick={() => join(true)}
                disabled={connecting}
                style={{
                  flex: 1,
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--border)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent-soft)"}
              >
                With Camera
              </button>
            </div>

            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
              [ service // p2p mesh rtc ]
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Active meeting video grid */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            alignContent: "start"
          }}>
            <Tile name={meName} stream={localStream} muted you />
            {peers.map((p) => (
              <Tile key={p.id} name={p.name} stream={p.stream} />
            ))}
          </div>

          {/* Call Controls Floating Bar */}
          <div style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            alignItems: "center",
            padding: "16px 24px",
            background: "var(--card)",
            borderTop: "1px solid var(--border)",
            zIndex: 10
          }}>
            <button
              onClick={toggleMic}
              style={{
                background: micOn ? "var(--accent-soft)" : "var(--border-soft)",
                color: micOn ? "var(--accent)" : "var(--foreground)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              {micOn ? (
                <>
                  <span style={{ fontSize: 14 }}>🎙</span> Mic Active
                </>
              ) : (
                <>
                  <span style={{ fontSize: 14 }}>🔇</span> Mic Muted
                </>
              )}
            </button>

            {hasCamTrack && (
              <button
                onClick={toggleCam}
                style={{
                  background: camOn ? "var(--accent-soft)" : "var(--border-soft)",
                  color: camOn ? "var(--accent)" : "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                {camOn ? (
                  <>
                    <span style={{ fontSize: 14 }}>📷</span> Video On
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 14 }}>📹</span> Video Off
                  </>
                )}
              </button>
            )}

            <button
              onClick={leave}
              style={{
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                transition: "background-color 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#991b1b"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--danger)"}
            >
              Disconnect
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse-fast {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
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
