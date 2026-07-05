import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/queries";
import { ProfileSettings } from "@/components/profile-settings";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("username, display_name, avatar_url, status_line").eq("id", user.id).single();

  return <ProfileSettings userId={user.id} initial={profile ?? { username: null, display_name: null, avatar_url: null, status_line: null }} />;
}
