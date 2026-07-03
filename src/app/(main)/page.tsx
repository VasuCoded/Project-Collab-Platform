import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user!.id)
    .single()

  return (
    <main style={{ maxWidth: 640, margin: '10vh auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem' }}>You&apos;re in 🎉</h1>
      <p style={{ color: '#555' }}>
        Signed in as <strong>{profile?.display_name}</strong>.
      </p>
      <p style={{ color: '#888', fontSize: '0.9rem' }}>
        The app shell — servers, channels, chat — is coming soon.
      </p>
      <form action={signOut}>
        <button style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}>
          Log out
        </button>
      </form>
    </main>
  )
}
