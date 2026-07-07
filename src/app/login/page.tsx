'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type InputState = 'idle' | 'email' | 'password'

const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '10px 14px',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  color: 'var(--foreground)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  transition: 'border-color 0.15s',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600 as const,
  color: 'var(--muted)',
  marginBottom: 5,
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

export default function LoginPage() {
  const supabase = createClient()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inputState, setInputState] = useState<InputState>('idle')

  async function signInWithGoogle() {
    setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setMsg(error.message)
  }

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) return setMsg(error.message)
      window.location.href = '/desk'
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setBusy(false)
      if (error) return setMsg(error.message)
      if (data.session) window.location.href = '/desk'
      else setMsg('Check your email to confirm your account, then sign in.')
    }
  }

  return (
    <main style={{
      height: '100dvh',
      maxHeight: '100dvh',
      overflow: 'hidden',
      display: 'flex',
      background: 'var(--background)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--foreground)',
    }}>

      {/* ── LEFT SIDE — Character Slot ─────────────────── */}
      <div style={{
        flex: '0 0 50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
        height: '100dvh',
      }}>
        {/* Grid BG */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.5,
        }} />

        {/* Branding */}
        <div style={{ position: 'absolute', top: 32, left: 32, display: 'flex', alignItems: 'center', gap: 10, zIndex: 2 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>CP</div>
          <span style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--display-font)', color: 'var(--foreground)' }}>Collab Platform</span>
        </div>

        {/*
          ── CHARACTER SLOT ──────────────────────────────
          Drop your character components here.
          `inputState` values:
            'idle'     → neutral
            'email'    → email focused  → characters smile
            'password' → password focused → characters cover eyes
          ─────────────────────────────────────────────── */}
        <div
          id="character-slot"
          data-input-state={inputState}
          style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          {/* LEFT PANEL CONTENT WILL BE INSERTED HERE */}
        </div>
      </div>

      {/* ── RIGHT SIDE — Auth Form ─────────────────────── */}
      <div style={{
        flex: '0 0 50%',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflowY: 'auto',
        padding: '48px 40px',
      }}>
        {/* Constrained inner card */}
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Back link */}
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--muted)', fontSize: 12,
            fontFamily: 'var(--font-mono)', textDecoration: 'none',
            marginBottom: 36, letterSpacing: '0.04em',
          }}>
            ← Home
          </Link>

          {/* Heading */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{
              fontFamily: 'var(--display-font)',
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}>
              {mode === 'signin' ? 'Welcome back.' : 'Join the platform.'}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              {mode === 'signin'
                ? 'Sign in to your workspace to continue.'
                : 'Create your account and start collaborating.'}
            </p>
          </div>

          {/* Google Button */}
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', padding: '10px 20px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--foreground)',
              fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 20,
              transition: 'border-color 0.15s',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Form */}
          <form onSubmit={onEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => { setInputState('email'); }}
                onBlur={() => setInputState('idle')}
                style={inputStyle}
                onFocusCapture={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlurCapture={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setInputState('password')}
                  onBlur={() => setInputState('idle')}
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocusCapture={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlurCapture={e => (e.target.style.borderColor = 'var(--border)')}
                />
                {/* Eye toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', padding: 4,
                    color: 'var(--muted)',
                    display: 'flex', alignItems: 'center',
                    lineHeight: 0,
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    /* Eye-off */
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    /* Eye */
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              style={{
                marginTop: 4,
                padding: '11px 24px',
                background: busy ? 'var(--muted)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '-0.01em',
              }}
            >
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>

          {/* Error / success message */}
          {msg && (
            <div style={{
              marginTop: 14, padding: '10px 14px',
              background: msg.includes('Check') ? 'var(--accent-soft)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${msg.includes('Check') ? 'var(--accent)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 8,
              fontSize: 13,
              color: msg.includes('Check') ? 'var(--accent)' : '#ef4444',
              lineHeight: 1.5,
            }}>
              {msg}
            </div>
          )}

          {/* Mode toggle */}
          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {mode === 'signin' ? (
              <>New here?{' '}
                <button onClick={() => { setMode('signup'); setMsg(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, fontFamily: 'var(--font-sans)' }}>
                  Create an account
                </button>
              </>
            ) : (
              <>Already have one?{' '}
                <button onClick={() => { setMode('signin'); setMsg(null) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, fontFamily: 'var(--font-sans)' }}>
                  Sign in
                </button>
              </>
            )}
          </div>

          {/* Footer */}
          <p style={{
            marginTop: 32, fontSize: 11,
            color: 'var(--muted)', lineHeight: 1.6,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
          }}>
            By signing in you agree to our terms. Chat, docs, boards, whiteboard, and voice — all in one place.
          </p>

        </div>
      </div>
    </main>
  )
}
