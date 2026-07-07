'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Live = { id: string; x: number; y: number; name: string; color: string }
type Tracked = Live & { t: number }

const W = 460
const H = 520

const NAMES = ['Ash', 'Ravi', 'Mira', 'Kai', 'Noor', 'Sol', 'Dev', 'Iris', 'Juno', 'Rey']
const COLORS = ['#0E5C46', '#B23A26', '#8a5e12', '#185FA5', '#534AB7']

const DEMO: { live: Live; drift: string }[] = [
  { live: { id: 'd1', x: 168, y: 150, name: 'Julian', color: '#8a5e12' }, drift: 'lb-drift-a 7s ease-in-out infinite' },
  { live: { id: 'd2', x: 322, y: 300, name: 'Vasu', color: '#0E5C46' }, drift: 'lb-drift-c 8s ease-in-out infinite' },
]

function Pointer({ live, drift }: { live: Live; drift?: string }) {
  return (
    <div style={{ position: 'absolute', left: live.x, top: live.y, transform: 'translate(-2px,-2px)', transition: drift ? undefined : 'left 0.09s linear, top 0.09s linear', animation: drift, pointerEvents: 'none', zIndex: 5 }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.22))' }}>
        <path d="M3 2.5 L15.5 9.2 L9.6 10.4 L7.7 16.2 Z" fill={live.color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span style={{ position: 'absolute', left: 14, top: 16, background: live.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)', boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
        {live.name}
      </span>
    </div>
  )
}

export function LoginBoard() {
  const supabase = useMemo(() => createClient(), [])
  const [remotes, setRemotes] = useState<Record<string, Tracked>>({})
  const boardRef = useRef<HTMLDivElement>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    const me = {
      id: Math.random().toString(36).slice(2, 9),
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }
    const channel = supabase.channel('login-lobby', { config: { broadcast: { self: false } } })
    channel
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const p = payload as Live
        setRemotes((prev) => ({ ...prev, [p.id]: { ...p, t: Date.now() } }))
      })
      .on('broadcast', { event: 'leave' }, ({ payload }) => {
        const id = (payload as { id: string }).id
        setRemotes((prev) => { const n = { ...prev }; delete n[id]; return n })
      })
      .subscribe()

    function onMove(e: PointerEvent) {
      const el = boardRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      if (x < 0 || y < 0 || x > r.width || y > r.height) return
      const now = Date.now()
      if (now - lastSent.current < 55) return
      lastSent.current = now
      channel.send({ type: 'broadcast', event: 'cursor', payload: { id: me.id, x: (x / r.width) * W, y: (y / r.height) * H, name: me.name, color: me.color } })
    }
    function onLeave() {
      channel.send({ type: 'broadcast', event: 'leave', payload: { id: me.id } })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('beforeunload', onLeave)

    const prune = setInterval(() => {
      const cutoff = Date.now() - 6000
      setRemotes((prev) => {
        const n: Record<string, Tracked> = {}
        let changed = false
        for (const [k, v] of Object.entries(prev)) {
          if (v.t < cutoff) { changed = true; continue }
          n[k] = v
        }
        return changed ? n : prev
      })
    }, 3000)

    return () => {
      onLeave()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('beforeunload', onLeave)
      clearInterval(prune)
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const live = Object.values(remotes)

  return (
    <div ref={boardRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
      <style>{`
        @keyframes lb-drift-a { 0%,100% { transform: translate(-2px,-2px); } 50% { transform: translate(8px,-10px); } }
        @keyframes lb-drift-b { 0%,100% { transform: translate(-2px,-2px); } 50% { transform: translate(-11px,5px); } }
        @keyframes lb-drift-c { 0%,100% { transform: translate(-2px,-2px); } 50% { transform: translate(5px,7px); } }
        @keyframes lb-pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>

      {/* Full bleed grid background */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--card)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(to right, var(--border-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--border-soft) 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.7 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.04) 100%)', pointerEvents: 'none' }} />
      </div>

      {live.length > 0 && (
        <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 6, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 99, border: '1px solid var(--border)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
          {live.length + 1} here now
        </div>
      )}

      {/* Centered Mockup Components Wrapper */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: W,
        height: H,
        pointerEvents: 'none',
        zIndex: 2
      }}>
        {/* Sticky Note */}
        <div style={{ position: 'absolute', top: 92, left: 22, width: 148, transform: 'rotate(-4deg)', pointerEvents: 'auto' }}>
          <div style={{ position: 'relative', background: '#f4edd6', color: '#3a3324', borderRadius: 3, padding: '16px 16px 20px', boxShadow: '0 12px 26px rgba(0,0,0,0.12)', fontFamily: "'Caveat','Segoe Script',cursive", fontSize: 21, lineHeight: 1.2 }}>
            keep the green deep, no neon
            <span style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 0 16px 16px', borderColor: 'transparent transparent rgba(0,0,0,0.10) transparent' }} />
          </div>
        </div>

        {/* Color Palette */}
        <div style={{ position: 'absolute', top: 20, right: 14, width: 150, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 20px rgba(0,0,0,0.08)', pointerEvents: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 10 }}>Palette</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {['#0E5C46', '#7fae95', '#f4edd6', '#B23A26', '#182019'].map((c) => (
              <span key={c} style={{ width: 20, height: 20, borderRadius: 5, background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }} />
            ))}
          </div>
        </div>

        {/* Task Card */}
        <div style={{ position: 'absolute', top: 244, left: 116, width: 232, height: 96, pointerEvents: 'auto' }}>
          <div style={{ position: 'absolute', inset: -8, border: '1.5px solid var(--accent)', borderRadius: 8, animation: 'lb-pulse 2.4s ease-in-out infinite' }}>
            {[['-4px', '-4px'], ['-4px', 'auto'], ['auto', '-4px'], ['auto', 'auto']].map(([t, l], i) => (
              <span key={i} style={{ position: 'absolute', top: t === 'auto' ? undefined : t, bottom: t === 'auto' ? '-4px' : undefined, left: l === 'auto' ? undefined : l, right: l === 'auto' ? '-4px' : undefined, width: 7, height: 7, background: 'var(--card)', border: '1.5px solid var(--accent)', borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: 4 }}>IN PROGRESS</span>
              <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>Due today</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>Design system variables</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>V</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Vasu</span>
            </div>
          </div>
        </div>

        {/* Aria Comment Bubble */}
        <div style={{ position: 'absolute', top: 428, left: 22, width: 214, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#B23A26', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>A</span>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '3px 12px 12px 12px', padding: '9px 12px', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', marginBottom: 2 }}>Aria</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>round these corners a touch?</div>
          </div>
        </div>
      </div>

      {DEMO.map((d) => <Pointer key={d.live.id} live={d.live} drift={d.drift} />)}
      {live.slice(0, 2).map((r) => <Pointer key={r.id} live={r} />)}
    </div>
  )
}
