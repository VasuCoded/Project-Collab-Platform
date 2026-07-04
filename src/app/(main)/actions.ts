"use server";

import { createClient } from "@/lib/supabase/server";

export async function createServer(name: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_server_with_template", { p_name: name });
  if (error) throw new Error(error.message);
  return data as string;
}

// Open (or reuse) a 1:1 DM with another user; returns the dm space id.
export async function startDm(otherUserId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_or_get_dm", { p_other: otherUserId });
  if (error) throw new Error(error.message);
  return data as string;
}
