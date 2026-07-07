'use client'

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface AlertConfig {
  title?: string
  message: string
  resolve: () => void
}

interface ConfirmConfig {
  title?: string
  message: string
  resolve: (value: boolean) => void
}

interface PromptConfig {
  title?: string
  message: string
  defaultValue?: string
  resolve: (value: string | null) => void
}

interface UIContextType {
  toast: (message: string, type?: ToastType) => void
  alert: (message: string, title?: string) => Promise<void>
  confirm: (message: string, title?: string) => Promise<boolean>
  prompt: (message: string, defaultValue?: string, title?: string) => Promise<string | null>
}

const UIContext = createContext<UIContextType | null>(null)

export function useUI() {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null)
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null)
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null)
  const [promptValue, setPromptValue] = useState('')

  // Toast implementation
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  // Alert implementation
  const alert = useCallback((message: string, title?: string) => {
    return new Promise<void>((resolve) => {
      setAlertConfig({ title, message, resolve })
    })
  }, [])

  // Confirm implementation
  const confirm = useCallback((message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmConfig({ title, message, resolve })
    })
  }, [])

  // Prompt implementation
  const prompt = useCallback((message: string, defaultValue = '', title?: string) => {
    setPromptValue(defaultValue)
    return new Promise<string | null>((resolve) => {
      setPromptConfig({ title, message, defaultValue, resolve })
    })
  }, [])

  // Helper close handlers
  const handleAlertClose = () => {
    if (alertConfig) {
      alertConfig.resolve()
      setAlertConfig(null)
    }
  }

  const handleConfirmClose = (value: boolean) => {
    if (confirmConfig) {
      confirmConfig.resolve(value)
      setConfirmConfig(null)
    }
  }

  const handlePromptClose = (submit: boolean) => {
    if (promptConfig) {
      promptConfig.resolve(submit ? promptValue : null)
      setPromptConfig(null)
    }
  }

  return (
    <UIContext.Provider value={{ toast, alert, confirm, prompt }}>
      {children}

      {/* TOAST CONTAINER */}
      <div style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          let bg = 'var(--card)'
          let border = 'var(--border)'
          let color = 'var(--foreground)'
          let icon = '✦'

          if (t.type === 'success') {
            bg = 'var(--success-soft)'
            border = 'rgba(47, 143, 91, 0.2)'
            color = 'var(--success)'
            icon = '✓'
          } else if (t.type === 'error') {
            bg = 'var(--danger-soft)'
            border = 'rgba(178, 58, 38, 0.2)'
            color = 'var(--danger)'
            icon = '✕'
          } else if (t.type === 'info') {
            bg = 'var(--accent-soft)'
            border = 'rgba(14, 92, 70, 0.2)'
            color = 'var(--accent)'
            icon = 'ℹ'
          }

          return (
            <div
              key={t.id}
              style={{
                background: bg,
                border: `1px solid ${border}`,
                color: color,
                padding: '12px 16px',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 260,
                maxWidth: 400,
                pointerEvents: 'auto',
                animation: 'toast-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                opacity: 0.8,
              }}>
                {icon}
              </span>
              <span style={{ flex: 1, color: 'var(--foreground)' }}>{t.message}</span>
            </div>
          )
        })}
      </div>

      {/* ALERT MODAL */}
      {alertConfig && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <span style={monoIndicatorStyle}>[ALERT]</span>
              {alertConfig.title && <h3 style={titleStyle}>{alertConfig.title}</h3>}
            </div>
            <p style={messageStyle}>{alertConfig.message}</p>
            <div style={actionsStyle}>
              <button onClick={handleAlertClose} style={primaryBtnStyle}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmConfig && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <span style={monoIndicatorStyle}>[CONFIRM]</span>
              {confirmConfig.title && <h3 style={titleStyle}>{confirmConfig.title}</h3>}
            </div>
            <p style={messageStyle}>{confirmConfig.message}</p>
            <div style={actionsStyle}>
              <button onClick={() => handleConfirmClose(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button onClick={() => handleConfirmClose(true)} style={primaryBtnStyle}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMPT MODAL */}
      {promptConfig && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <span style={monoIndicatorStyle}>[INPUT]</span>
              {promptConfig.title && <h3 style={titleStyle}>{promptConfig.title}</h3>}
            </div>
            <p style={messageStyle}>{promptConfig.message}</p>
            <form onSubmit={(e) => { e.preventDefault(); handlePromptClose(true); }} style={{ margin: '16px 0 0 0' }}>
              <input
                type="text"
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                style={inputStyle}
              />
              <div style={{ ...actionsStyle, marginTop: 20 }}>
                <button type="button" onClick={() => handlePromptClose(false)} style={secondaryBtnStyle}>
                  Cancel
                </button>
                <button type="submit" style={primaryBtnStyle}>
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSS Animation Keyframes Injector */}
      <style>{`
        @keyframes toast-in {
          from { transform: translateY(-12px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </UIContext.Provider>
  )
}

// Styling Constants
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(4px)',
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  width: '100%',
  maxWidth: 400,
  padding: 24,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
  animation: 'toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
}

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 12,
}

const monoIndicatorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono), monospace',
  fontSize: 10,
  color: 'var(--accent)',
  letterSpacing: '0.08em',
  fontWeight: 700,
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display-font), Georgia, serif',
  fontSize: 20,
  fontWeight: 800,
  color: 'var(--foreground)',
  margin: 0,
  letterSpacing: '-0.01em',
}

const messageStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: 'var(--muted)',
  lineHeight: 1.5,
  margin: '0 0 16px 0',
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 16,
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-mono), monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--foreground)',
  borderRadius: 6,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-mono), monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 14,
  color: 'var(--foreground)',
  outline: 'none',
  transition: 'border-color 0.15s',
}
