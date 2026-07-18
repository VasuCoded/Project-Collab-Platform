'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type Item = { id: string; x: number; y: number; text: string; color: string }
type Cursor = { id: string; x: number; y: number; name: string; color: string; t: number }
type Template = { label: string; text: string; color: string }

const NOTE_COLORS = ['#f4edd6', '#E4EFE9', '#DDEBE0', '#F7E9E4', '#F3EAD6']
const CURSOR_COLORS = ['#0E5C46', '#B23A26', '#8a5e12', '#185FA5', '#534AB7']
const TEMPLATES: Template[] = [
  { label: 'Blank', text: '', color: NOTE_COLORS[0] },
  { label: 'Idea', text: '💡 ', color: NOTE_COLORS[1] },
  { label: 'To-do', text: '☐ ', color: NOTE_COLORS[2] },
  { label: 'Question', text: '❓ ', color: NOTE_COLORS[3] },
  { label: 'Decision', text: '✅ ', color: NOTE_COLORS[4] },
]
const MAX_HISTORY = 50

function hashIndex(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % n
}
function rid() {
  return Math.random().toString(36).slice(2, 10)
}
function cloneItems(items: Item[]) {
  return items.map((i) => ({ ...i }))
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
  const drag = useRef<{ id: string; ox: number; oy: number; pre: Item[] } | null>(null)
  const pan = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)

  const lastColorRef = useRef<string>(NOTE_COLORS[0])
  const pastRef = useRef<Item[][]>([])
  const futureRef = useRef<Item[][]>([])
  const typingSession = useRef<Set<string>>(new Set())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const templateMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`board:${channelId}:lastColor`)
      if (saved && NOTE_COLORS.includes(saved)) lastColorRef.current = saved
    } catch { /* localStorage unavailable */ }
    pastRef.current = []
    futureRef.current = []
    queueMicrotask(() => {
      setCanUndo(false)
      setCanRedo(false)
    })
  }, [channelId])

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

  // ---- history (undo/redo) ----
  function pushHistoryFrom(snapshot: Item[]) {
    pastRef.current = [...pastRef.current, snapshot].slice(-MAX_HISTORY)
    futureRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }
  function pushHistory() {
    pushHistoryFrom(cloneItems(itemsRef.current))
  }

  function applySnapshot(target: Item[]) {
    const prevItems = itemsRef.current
    const prevById = new Map(prevItems.map((i) => [i.id, i]))
    const nextIds = new Set(target.map((i) => i.id))
    for (const p of prevItems) {
      if (!nextIds.has(p.id)) chRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id: p.id } })
    }
    for (const it of target) {
      const p = prevById.get(it.id)
      if (!p || p.x !== it.x || p.y !== it.y || p.text !== it.text || p.color !== it.color) {
        chRef.current?.send({ type: 'broadcast', event: 'item', payload: it })
      }
    }
    setAndTrack(() => cloneItems(target))
    persist()
  }

  function undo() {
    if (pastRef.current.length === 0) return
    const snapshot = pastRef.current[pastRef.current.length - 1]
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, cloneItems(itemsRef.current)]
    applySnapshot(snapshot)
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(true)
  }
  function redo() {
    if (futureRef.current.length === 0) return
    const snapshot = futureRef.current[futureRef.current.length - 1]
    futureRef.current = futureRef.current.slice(0, -1)
    pastRef.current = [...pastRef.current, cloneItems(itemsRef.current)]
    applySnapshot(snapshot)
    setCanRedo(futureRef.current.length > 0)
    setCanUndo(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!showTemplateMenu) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) setShowTemplateMenu(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [showTemplateMenu])

  function addNote(template?: Template) {
    const el = boardRef.current
    const w = el?.clientWidth ?? 800
    const h = el?.clientHeight ?? 600
    const off = ((spawn.current++ % 6) - 3) * 18
    const it: Item = {
      id: rid(),
      x: ((el?.scrollLeft ?? 0) + w / 2) / zoom - 90 + off,
      y: ((el?.scrollTop ?? 0) + h / 2) / zoom - 90 + off,
      text: template?.text ?? '',
      color: template?.color ?? lastColorRef.current,
    }
    pushHistory()
    setAndTrack((prev) => [...prev, it])
    pushItem(it)
  }

  function setNoteColor(id: string, color: string) {
    pushHistory()
    let updated: Item | null = null
    setAndTrack((prev) => prev.map((p) => { if (p.id === id) { updated = { ...p, color }; return updated } return p }))
    if (updated) pushItem(updated)
    lastColorRef.current = color
    try { localStorage.setItem(`board:${channelId}:lastColor`, color) } catch { /* localStorage unavailable */ }
  }

  function editNoteText(id: string, text: string) {
    if (!typingSession.current.has(id)) {
      pushHistory()
      typingSession.current.add(id)
    }
    let updated: Item | null = null
    setAndTrack((prev) => prev.map((p) => { if (p.id === id) { updated = { ...p, text }; return updated } return p }))
    if (updated) pushItem(updated)
  }

  function removeNote(id: string) {
    pushHistory()
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
    const px = (e.clientX - r.left + el.scrollLeft) / zoom
    const py = (e.clientY - r.top + el.scrollTop) / zoom
    drag.current = { id: it.id, ox: px - it.x, oy: py - it.y, pre: cloneItems(itemsRef.current) }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
  }
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current
    const el = boardRef.current
    if (!d || !el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left + el.scrollLeft) / zoom - d.ox
    const y = (e.clientY - r.top + el.scrollTop) / zoom - d.oy
    setAndTrack((prev) => prev.map((p) => (p.id === d.id ? { ...p, x, y } : p)))
  }
  const onDragUp = () => {
    const d = drag.current
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    if (d) {
      const it = itemsRef.current.find((p) => p.id === d.id)
      if (it) {
        const before = d.pre.find((p) => p.id === d.id)
        if (before && (before.x !== it.x || before.y !== it.y)) pushHistoryFrom(d.pre)
        pushItem(it)
      }
    }
    drag.current = null
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    const el = boardRef.current
    if (!el) return
    const now = Date.now()
    if (now - lastPointer.current < 55) return
    lastPointer.current = now
    const r = el.getBoundingClientRect()
    chRef.current?.send({ type: 'broadcast', event: 'cursor', payload: { id: me, name: meName, color: myColor, x: (e.clientX - r.left + el.scrollLeft) / zoom, y: (e.clientY - r.top + el.scrollTop) / zoom } })
  }

  // drag empty canvas to pan (mouse only; touch keeps native scroll)
  function onPanDown(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-note]')) return
    const el = boardRef.current
    if (!el) return
    pan.current = { sx: e.clientX, sy: e.clientY, ox: el.scrollLeft, oy: el.scrollTop }
    window.addEventListener('pointermove', onPanMove)
    window.addEventListener('pointerup', onPanUp)
  }
  const onPanMove = (e: PointerEvent) => {
    const p = pan.current, el = boardRef.current
    if (!p || !el) return
    el.scrollLeft = p.ox - (e.clientX - p.sx)
    el.scrollTop = p.oy - (e.clientY - p.sy)
  }
  const onPanUp = () => {
    window.removeEventListener('pointermove', onPanMove)
    window.removeEventListener('pointerup', onPanUp)
    pan.current = null
  }

  // zoom keeping the point under (sx,sy) fixed
  function zoomAt(factor: number, sx: number, sy: number) {
    const el = boardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const z = zoomRef.current
    const nz = Math.min(2.5, Math.max(0.35, z * factor))
    if (nz === z) return
    const px = sx - r.left, py = sy - r.top
    const cx = (el.scrollLeft + px) / z
    const cy = (el.scrollTop + py) / z
    zoomRef.current = nz
    setZoom(nz)
    requestAnimationFrame(() => { el.scrollLeft = cx * nz - px; el.scrollTop = cy * nz - py })
  }
  function zoomButton(factor: number) {
    const el = boardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2)
  }
  function resetZoom() {
    if (zoomRef.current !== 1) zoomButton(1 / zoomRef.current)
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const remoteCursors = Object.values(cursors)
  const zoomBtn: React.CSSProperties = { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', borderRadius: 6, fontSize: 15, lineHeight: 1, padding: 0 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, background: 'var(--background)', fontFamily: 'var(--font-sans)', transition: 'background-color 0.15s ease' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>▢ {channelName}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{here} here · live</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--card)' }}>
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ ...zoomBtn, opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}>↶</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" style={{ ...zoomBtn, opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}>↷</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--card)' }}>
          <button onClick={() => zoomButton(1 / 1.2)} title="Zoom out" style={zoomBtn}>−</button>
          <button onClick={resetZoom} title="Reset zoom" style={{ ...zoomBtn, width: 'auto', minWidth: 44, padding: '0 6px', fontSize: 11, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomButton(1.2)} title="Zoom in" style={zoomBtn}>+</button>
        </div>
        <div ref={templateMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <div style={{ display: 'inline-flex', border: '1px solid #e4d9b0', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => addNote()} title="Add a blank sticky note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f4edd6', color: '#3a3324', border: 'none', padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Sticky note
            </button>
            <button onClick={() => setShowTemplateMenu((v) => !v)} title="Choose a template" style={{ background: '#f4edd6', color: '#3a3324', border: 'none', borderLeft: '1px solid #e4d9b0', padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}>
              ▾
            </button>
          </div>
          {showTemplateMenu && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 22px rgba(0,0,0,0.14)', padding: 4, zIndex: 60, minWidth: 140 }}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => { addNote(t); setShowTemplateMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: 'var(--foreground)' }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={boardRef}
        onPointerMove={onBoardPointerMove}
        onPointerDown={onPanDown}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'auto',
          touchAction: 'pan-x pan-y',
        }}
      >
        <div style={{ position: 'relative', width: 2400 * zoom, height: 1600 * zoom }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 2400,
            height: 1600,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            backgroundImage: 'linear-gradient(to right, var(--border-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--border-soft) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}>
          {items.length === 0 && (
            <div style={{ position: 'absolute', top: 60, left: 40, color: 'var(--faint)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
              Empty board. Hit + Sticky note to drop your first one.
            </div>
          )}

          {items.map((it) => (
            <div
              key={it.id}
              data-note
              onPointerDown={(e) => onNotePointerDown(e, it)}
              style={{ position: 'absolute', left: it.x, top: it.y, width: 180, minHeight: 150, background: it.color, borderRadius: 4, boxShadow: '0 8px 22px rgba(0,0,0,0.14)', cursor: 'grab', padding: 12, display: 'flex', flexDirection: 'column', color: '#3a3324' }}
            >
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, height: 14 }}>
                {NOTE_COLORS.map((c) => (
                  <button key={c} onClick={() => setNoteColor(it.id, c)} title="Color" style={{ width: 12, height: 12, borderRadius: 3, background: c, border: c === it.color ? '1px solid #3a3324' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', padding: 0 }} />
                ))}
                <button onClick={() => removeNote(it.id)} title="Delete note" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#3a3324', opacity: 0.5, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <textarea
                value={it.text}
                onChange={(e) => editNoteText(it.id, e.target.value)}
                onBlur={() => typingSession.current.delete(it.id)}
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
    </div>
  )
}
