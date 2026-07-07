import { cache } from "react";
import { createClient } from "./server";

// React cache() dedupes these within a single request, so the layout, the
// space layout, and the channel page share one round-trip each instead of
// firing the same Supabase query three times on every navigation.

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).single();
  return data;
});

export const getSpace = cache(async (spaceId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("spaces").select("id, name, type").eq("id", spaceId).single();
  return data;
});

export const getSpaceChannels = cache(async (spaceId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("channels")
    .select("id, type, name, position")
    .eq("space_id", spaceId)
    .order("position");
  return data ?? [];
});

export const getMyRole = cache(async (spaceId: string, userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
});

export type SpaceUnread = { unread: number; last: string | null };

// Per-space unread counts + last activity for the current user. Falls back to an
// empty map if the unread_summary RPC isn't deployed yet, so the UI degrades to
// "everything read" rather than breaking before the migration is applied.
export const getUnreadBySpace = cache(async () => {
  const supabase = await createClient();
  const map = new Map<string, SpaceUnread>();
  const { data, error } = await supabase.rpc("unread_summary");
  if (error) return map;
  for (const r of (data ?? []) as { space_id: string; unread: number; last_message_at: string | null }[]) {
    map.set(r.space_id, { unread: Number(r.unread) || 0, last: r.last_message_at });
  }
  return map;
});

// Resolve the "other person" behind each DM space so we can show a real name and
// avatar instead of the null space.name. Keyed by dm space id.
export async function getDmPeers(dmSpaceIds: string[], meId: string) {
  const map = new Map<string, { name: string | null; avatar: string | null }>();
  if (dmSpaceIds.length === 0) return map;
  const supabase = await createClient();
  const { data: members } = await supabase.from("space_members").select("space_id, user_id").in("space_id", dmSpaceIds);
  const rows = (members ?? []) as { space_id: string; user_id: string }[];
  const peerIds = [...new Set(rows.filter((r) => r.user_id !== meId).map((r) => r.user_id))];
  const profById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (peerIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", peerIds);
    (profs ?? []).forEach((p) => profById.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url }));
  }
  for (const spaceId of dmSpaceIds) {
    const peer = rows.find((r) => r.space_id === spaceId && r.user_id !== meId);
    const prof = peer ? profById.get(peer.user_id) : null;
    map.set(spaceId, { name: prof?.display_name ?? null, avatar: prof?.avatar_url ?? null });
  }
  return map;
}

export type DmListItem = { id: string; name: string | null; avatar: string | null; unread: number; lastAt: string | null };

// Every DM conversation for the current user, most recently active first.
export const getDmList = cache(async (meId: string): Promise<DmListItem[]> => {
  const supabase = await createClient();
  const [{ data: spaces }, unread] = await Promise.all([
    supabase.from("spaces").select("id, name").eq("type", "dm"),
    getUnreadBySpace(),
  ]);
  const dmSpaces = spaces ?? [];
  const peers = await getDmPeers(dmSpaces.map((d) => d.id), meId);
  return dmSpaces
    .map((d) => ({
      id: d.id,
      name: peers.get(d.id)?.name ?? d.name,
      avatar: peers.get(d.id)?.avatar ?? null,
      unread: unread.get(d.id)?.unread ?? 0,
      lastAt: unread.get(d.id)?.last ?? null,
    }))
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
});
