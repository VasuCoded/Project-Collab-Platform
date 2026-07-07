'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type Item = { id: string; x: number; y: number; text: string; color: string }
type Cursor = { id: string; x: number; y: number; name: string; color: string; t: number }

const NOTE_COLORS = ['#f4edd6', '#E4EFE9', '#DDEBE0', '#F7E9E4', '#F3EAD6']
const CURSOR_COLORS = ['#0E5C46', '#B23A26', '#8a5e12', '#185FA5', '#534AB7']

function hashIndex(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % n
}
function rid() {
  return Math.random().toString(36).slice(2, 10)
}

export function BoardChannel({ channelId, channelName, me, meName }: { channelId: string; channelName: string; me: string; meName: string }) {
  const supabase = useMemo(() => createClient(), [])
  const myColor = useMemo(() => CURSOR_COLORS[hashIndex(me, CURSOR_COLORS.length)], [me])
  const [items, setItems] = useState<Item[]>([])
  const [cursors, setCursors] = useState<Record<string, Cursor>>({})
  const [here, setHere] = useState(1)

  const boardRef = useRef<HTMLDivElement>(null)
  const chRef = useRef<RealtimeChannel | null>(null)
  const itemsRef = useRef<Item[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointer = useRef(0)
  const spawn = useRef(0)
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null)

  const setAndTrack = useCallback((updater: (prev: Item[]) => Item[]) => {
    setItems((prev) => {
      const next = updater(prev)
      itemsRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('boards').select('items').eq('channel_id', channelId).maybeSingle()
      if (!active) return
      const loaded = (data?.items as Item[] | undefined) ?? []
      itemsRef.current = loaded
      setItems(loaded)
    })()
    return () => { active = false }
  }, [channelId, supabase])

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase.from('boards').upsert({ channel_id: channelId, items: itemsRef.current, updated_at: new Date().toISOString(), updated_by: me })
        .then(({ error }) => { if (error) console.error('[board] persist failed', error.message) })
    }, 600)
  }, [channelId, me, supabase])

  useEffect(() => {
    const ch = supabase.channel(`board:${channelId}`, { config: { presence: { key: me }, broadcast: { self: false } } })
    chRef.current = ch
    ch.on('broadcast', { event: 'item' }, ({ payload }) => {
      const it = payload as Item
      setAndTrack((prev) => (prev.some((p) => p.id === it.id) ? prev.map((p) => (p.id === it.id ? it : p)) : [...prev, it]))
    })
    ch.on('broadcast', { event: 'delete' }, ({ payload }) => {
      const id = (payload as { id: string }).id
      setAndTrack((prev) => prev.filter((p) => p.id !== id))
    })
    ch.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const c = payload as Cursor
      setCursors((prev) => ({ ...prev, [c.id]: { ...c, t: Date.now() } }))
    })
    ch.on('presence', { event: 'sync' }, () => setHere(Object.keys(ch.presenceState()).length || 1))
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      setCursors((prev) => { const n = { ...prev }; delete n[key as string]; return n })
    })
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ name: meName }) })

    const prune = setInterval(() => {
      const cut = Date.now() - 6000
      setCursors((prev) => {
        const n: Record<string, Cursor> = {}
        let changed = false
        for (const [k, v] of Object.entries(prev)) { if (v.t < cut) { changed = true; continue } n[k] = v }
        return changed ? n : prev
      })
    }, 3000)

    return () => { clearInterval(prune); supabase.removeChannel(ch); chRef.current = null }
  }, [channelId, me, meName, supabase, setAndTrack])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  function pushItem(it: Item) {
    chRef.current?.send({ type: 'broadcast', event: 'item', payload: it })
    persist()
  }

  function addNote() {
    const el = boardRef.current
    const w = el?.clientWidth ?? 800
    const h = el?.clientHeight ?? 600
    const off = ((spawn.current++ % 6) - 3) * 18
    const it: Item = {
      id: rid(),
      x: (el?.scrollLeft ?? 0) + w / 2 - 90 + off,
      y: (el?.scrollTop ?? 0) + h / 2 - 90 + off,
      text: '',
      color: NOTE_COLORS[0],
    }
    setAndTrack((prev) => [...prev, it])
    pushItem(it)
  }

  function editNote(id: string, patch: Partial<Item>) {
    let updated: Item | null = null
    setAndTrack((prev) => prev.map((p) => { if (p.id === id) { updated = { ...p, ...patch }; return updated } return p }))
    if (updated) pushItem(updated)
  }

  function removeNote(id: string) {
    setAndTrack((prev) => prev.filter((p) => p.id !== id))
    chRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id } })
    persist()
  }

  function onNotePointerDown(e: React.PointerEvent, it: Item) {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
    e.preventDefault()
    const el = boardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    drag.current = { id: it.id, ox: e.clientX - r.left + el.scrollLeft - it.x, oy: e.clientY - r.top + el.scrollTop - it.y }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
  }
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current
    const el = boardRef.current
    if (!d || !el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left + el.scrollLeft - d.ox
    const y = e.clientY - r.top + el.scrollTop - d.oy
    setAndTrack((prev) => prev.map((p) => (p.id === d.id ? { ...p, x, y } : p)))
  }
  const onDragUp = () => {
    const d = drag.current
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    if (d) { const it = itemsRef.current.find((p) => p.id === d.id); if (it) pushItem(it) }
    drag.current = null
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    const el = boardRef.current
    if (!el) return
    const now = Date.now()
    if (now - lastPointer.current < 55) return
    lastPointer.current = now
    const r = el.getBoundingClientRect()
    chRef.current?.send({ type: 'broadcast', event: 'cursor', payload: { id: me, name: meName, color: myColor, x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop } })
  }

  const remoteCursors = Object.values(cursors)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, background: 'var(--background)', fontFamily: 'var(--font-sans)', transition: 'background-color 0.15s ease' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>▢ {channelName}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{here} here · live</span>
        <button onClick={addNote} title="Add a sticky note" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f4edd6', color: '#3a3324', border: '1px solid #e4d9b0', borderRadius: 8, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Sticky note
        </button>
      </div>

      <div
        ref={boardRef}
        onPointerMove={onBoardPointerMove}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'auto',
          backgroundImage: 'linear-gradient(to right, var(--border-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--border-soft) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      >
        <div style={{ position: 'relative', width: 2400, height: 1600 }}>
          {items.length === 0 && (
            <div style={{ position: 'absolute', top: 60, left: 40, color: 'var(--faint)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
              Empty board. Hit + Sticky note to drop your first one.
            </div>
          )}

          {items.map((it) => (
            <div
              key={it.id}
              onPointerDown={(e) => onNotePointerDown(e, it)}
              style={{ position: 'absolute', left: it.x, top: it.y, width: 180, minHeight: 150, background: it.color, borderRadius: 4, boxShadow: '0 8px 22px rgba(0,0,0,0.14)', cursor: 'grab', padding: 12, display: 'flex', flexDirection: 'column', color: '#3a3324' }}
            >
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, height: 14 }}>
                {NOTE_COLORS.map((c) => (
                  <button key={c} onClick={() => editNote(it.id, { color: c })} title="Color" style={{ width: 12, height: 12, borderRadius: 3, background: c, border: c === it.color ? '1px solid #3a3324' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', padding: 0 }} />
                ))}
                <button onClick={() => removeNote(it.id)} title="Delete note" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3a3324', opacity: 0.5, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <textarea
                value={it.text}
                onChange={(e) => editNote(it.id, { text: e.target.value })}
                placeholder="Type…"
                style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: '#3a3324', fontSize: 15, lineHeight: 1.35, fontFamily: "'Caveat','Segoe Script',var(--font-sans)", minHeight: 96 }}
              />
            </div>
          ))}

          {remoteCursors.map((c) => (
            <div key={c.id} style={{ position: 'absolute', left: c.x, top: c.y, pointerEvents: 'none', zIndex: 50, transition: 'left 0.08s linear, top 0.08s linear' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.22))' }}>
                <path d="M3 2.5 L15.5 9.2 L9.6 10.4 L7.7 16.2 Z" fill={c.color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span style={{ position: 'absolute', left: 13, top: 14, background: c.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' }}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
