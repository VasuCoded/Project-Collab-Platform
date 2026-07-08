'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export default function OnboardingPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = '/login'
        return
      }
      setUserId(data.user.id)
    })
  }, [supabase])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!USERNAME_RE.test(username)) {
      setMsg('Username must be 3 to 20 characters: lowercase letters, numbers, underscore.')
      return
    }
    if (!name.trim()) {
      setMsg('Please enter a display name.')
      return
    }
    setBusy(true)
    setMsg(null)

    let avatar_url: string | null = null
    if (file) {
      const path = `${userId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) {
        setBusy(false)
        setMsg(`Avatar upload failed: ${upErr.message}`)
        return
      }
      avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username, display_name: name.trim(), ...(avatar_url ? { avatar_url } : {}) })
      .eq('id', userId)
    setBusy(false)
    if (error) {
      const taken = error.code === '23505' || /duplicate|unique/i.test(error.message)
      setMsg(taken ? 'That username is taken. Try another.' : error.message)
      return
    }
    window.location.href = '/desk'
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--foreground)', fontFamily: 'var(--display-font)', letterSpacing: '-0.02em' }}>One quick thing</h1>
        <p style={{ color: 'var(--muted)', margin: '6px 0 28px', fontSize: 14, lineHeight: 1.5 }}>Pick a username and a display name.</p>

        <form onSubmit={onSubmit}>
          <label style={label}>Username</label>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, paddingLeft: 12, marginBottom: 6 }}>
            <span style={{ color: 'var(--faint)', fontSize: 14 }}>@</span>
            <input
              required
              placeholder="arsh"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              maxLength={20}
              style={{ ...input, background: 'transparent', border: 'none', paddingLeft: 4, marginBottom: 0 }}
              onFocusCapture={(e) => (e.currentTarget.parentElement!.style.borderColor = 'var(--accent)')}
              onBlurCapture={(e) => (e.currentTarget.parentElement!.style.borderColor = 'var(--border)')}
            />
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 11, margin: '0 0 18px' }}>Lowercase letters, numbers, underscore. People find you by this.</p>

          <label style={label}>Display name</label>
          <input required placeholder="e.g. Arsh" value={name} onChange={(e) => setName(e.target.value)} style={input}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')} />

          <label style={label}>Avatar (optional)</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ marginBottom: 20, color: 'var(--muted)', fontSize: 13 }} />

          <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Saving…' : 'Continue →'}
          </button>
        </form>

        {msg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14 }}>{msg}</p>}
      </div>
    </main>
  )
}

const label: CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const input: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 14px', marginBottom: 18, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--foreground)', fontFamily: 'var(--font-sans)', outline: 'none', transition: 'border-color 0.15s' }
const btn: CSSProperties = { display: 'block', width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)' }
