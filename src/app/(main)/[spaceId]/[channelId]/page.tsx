import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chat } from "@/components/chat";
import { Whiteboard } from "@/components/whiteboard";

const placeholder: Record<string, { label: string; note: string }> = {
  voice_video: { label: "Voice / Video", note: "Calls are coming later." },
  todo: { label: "Tasks", note: "Task board is coming later." },
  notes: { label: "Notes", note: "Shared notes are coming later." },
  reminders: { label: "Reminders", note: "Reminders are coming later." },
  docs_sheet: { label: "Shared Docs", note: "Embedded docs are coming later." },
  cubicle: { label: "Cubicle", note: "Personal workspace is coming later." },
};

export default async function ChannelPage({ params }: { params: Promise<{ spaceId: string; channelId: string }> }) {
  const { channelId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: channel } = await supabase.from("channels").select("id, name, type").eq("id", channelId).single();
  if (!channel) notFound();

  if ((channel.type === "text" || channel.type === "whiteboard") && user) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
    const meName = profile?.display_name ?? "You";
    if (channel.type === "whiteboard") {
      return <Whiteboard channelId={channel.id} channelName={channel.name} me={user.id} meName={meName} />;
    }
    return <Chat channelId={channel.id} channelName={channel.name} me={user.id} meName={meName} />;
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
