import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Members, type Member } from "@/components/members";

export default async function MembersPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase.from("spaces").select("id, name, type").eq("id", spaceId).single();
  if (!space) notFound();

  const { data: members } = await supabase
    .from("space_members")
    .select("user_id, role, profiles(display_name, avatar_url, status_line)")
    .eq("space_id", spaceId);

  const list = (members ?? []) as unknown as Member[];
  const mine = list.find((m) => m.user_id === user.id);
  const spaceName = space.name ?? (space.type === "private" ? "Private" : space.type === "dm" ? "Direct message" : "Server");

  return <Members spaceId={spaceId} spaceName={spaceName} me={user.id} myRole={mine?.role ?? "member"} initialMembers={list} />;
}
