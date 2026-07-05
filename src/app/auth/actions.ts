'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createClient()
  // scope: 'local' just clears this session's cookies. The default ('global')
  // makes a round-trip to Supabase to revoke every session everywhere, which is
  // what made logout hang. The refresh token expires on its own.
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
