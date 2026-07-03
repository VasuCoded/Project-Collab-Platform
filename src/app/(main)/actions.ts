'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createServer(name: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_server_with_template', { p_name: name })
  if (error) throw new Error(error.message)
  redirect(`/${data}`)
}
