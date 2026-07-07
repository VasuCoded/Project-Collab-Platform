'use client'

import { useEffect, useRef, useState } from 'react'

export type MenuItem = { label: string; onClick: () => void; danger?: boolean } | 'divider'

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      const nx = x + r.width > window.innerWidth ? Math.max(8, window.innerWidth - r.width - 8) : x
      const ny = y + r.height > window.innerHeight ? Math.max(8, window.innerHeight - r.height - 8) : y
      setPos({ x: nx, y: ny })
    }
  }, [x, y])

  useEffect(() => {
    const close = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        minWidth: 190,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 12px 32px var(--shadow-lg)',
        padding: 6,
        fontFamily: 'var(--font-sans)',
        animation: 'ctx-in 0.12s ease',
      }}
    >
      <style>{`@keyframes ctx-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
      {items.map((it, i) =>
        it === 'divider' ? (
          <div key={i} style={{ height: 1, background: 'var(--border-soft)', margin: '5px 6px' }} />
        ) : (
          <button
            key={i}
            onClick={() => { it.onClick(); onClose() }}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '7px 10px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: it.danger ? 'var(--danger)' : 'var(--foreground)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = it.danger ? 'var(--danger-soft)' : 'var(--accent-soft)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  )
}
