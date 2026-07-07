import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getProfile, getMyRole, getSpace, getDmPeers } from "@/lib/supabase/queries";
import { Chat } from "@/components/chat";
import { CubicleChannel } from "@/components/cubicle-channel";
import { Whiteboard } from "@/components/whiteboard";
import { TaskBoard } from "@/components/task-board";
import { DocsChannel } from "@/components/docs-channel";
import { NotesChannel } from "@/components/notes-channel";
import { RemindersChannel } from "@/components/reminders-channel";
import { VoiceChannel } from "@/components/voice-channel";

const placeholder: Record<string, { label: string; note: string }> = {};

export default async function ChannelPage({ params }: { params: Promise<{ spaceId: string; channelId: string }> }) {
  const { spaceId, channelId } = await params;
  const supabase = await createClient();

  const [user, { data: channel }] = await Promise.all([
    getCurrentUser(), // cache hit: already resolved in the main layout this request
    supabase.from("channels").select("id, name, type, embed_url, owner_id").eq("id", channelId).single(),
  ]);
  if (!channel) notFound();

  // text, cubicle, whiteboard and todo all need the profile.
  if ((channel.type === "text" || channel.type === "cubicle" || channel.type === "whiteboard" || channel.type === "todo") && user) {
    const profile = await getProfile(user.id); // cache hit: shared with the main layout
    const meName = profile?.display_name ?? "You";
    if (channel.type === "whiteboard") {
      return <Whiteboard channelId={channel.id} channelName={channel.name} me={user.id} meName={meName} />;
    }
    if (channel.type === "todo") {
      return <TaskBoard spaceId={spaceId} channelId={channel.id} channelName={channel.name} me={user.id} />;
    }
    if (channel.type === "cubicle") {
      const isOwner = channel.owner_id === user.id;
      let ownerName = meName;
      if (channel.owner_id && !isOwner) {
        const op = await getProfile(channel.owner_id);
        ownerName = op?.display_name ?? "Member";
      }
      return <CubicleChannel channelId={channel.id} channelName={channel.name} ownerName={ownerName} isOwner={isOwner} me={user.id} meName={meName} />;
    }
    // In a DM, title the chat with the other person (no "#") rather than "# direct".
    const space = await getSpace(spaceId); // cache hit: shared with the space layout
    if (space?.type === "dm") {
      const peers = await getDmPeers([spaceId], user.id);
      return <Chat channelId={channel.id} channelName={peers.get(spaceId)?.name ?? "Direct message"} me={user.id} meName={meName} dm />;
    }
    return <Chat channelId={channel.id} channelName={channel.name} me={user.id} meName={meName} />;
  }

  if (channel.type === "notes" && user) {
    return <NotesChannel channelId={channel.id} channelName={channel.name} me={user.id} />;
  }

  if (channel.type === "reminders" && user) {
    return <RemindersChannel channelId={channel.id} channelName={channel.name} me={user.id} />;
  }

  if (channel.type === "voice_video" && user) {
    const profile = await getProfile(user.id);
    return <VoiceChannel channelId={channel.id} channelName={channel.name} me={user.id} meName={profile?.display_name ?? "You"} />;
  }

  if (channel.type === "docs_sheet" && user) {
    const role = await getMyRole(spaceId, user.id);
    const canManage = role === "owner" || role === "admin";
    return <DocsChannel channelId={channel.id} channelName={channel.name} embedUrl={channel.embed_url} canManage={canManage} />;
  }

  const p = placeholder[channel.type] ?? { label: channel.name, note: "Coming later." };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #262626", fontWeight: 700, color: "#fff" }}>{channel.name}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "#999" }}>
        <div style={{ fontSize: 18, color: "#ddd" }}>{p.label}</div>
        <div style={{ fontSize: 14, color: "#888" }}>{p.note}</div>
      </div>
    </div>
  );
}
