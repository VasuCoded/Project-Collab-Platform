import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Rail } from '@/components/rail'

export default async function MainLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  if (!profile?.display_name) redirect('/onboarding')

  const { data: spaces } = await supabase.from('spaces').select('id, type, name').order('created_at')

  const all = spaces ?? []
  const servers = all.filter((s) => s.type === 'server')
  const dms = all.filter((s) => s.type === 'dm')
  const privateSpace = all.find((s) => s.type === 'private') ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Rail servers={servers} dms={dms} privateSpace={privateSpace} profile={profile} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</div>
    </div>
  )
}
