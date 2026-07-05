/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startDm } from "@/app/(main)/actions";

export type Member = {
  user_id: string;
  role: string;
  profiles: { display_name: string | null; avatar_url: string | null; status_line: string | null } | null;
};

const ASSIGNABLE = ["member", "moderator", "admin"];

export function Members({
  spaceId,
  spaceName,
  me,
  myRole,
  initialMembers,
}: {
  spaceId: string;
  spaceName: string;
  me: string;
  myRole: string;
  initialMembers: Member[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [dmBusy, setDmBusy] = useState<string | null>(null);
  const canManage = myRole === "owner" || myRole === "admin";

  async function message(userId: string) {
    if (dmBusy) return;
    setDmBusy(userId);
    try {
      const id = await startDm(userId);
      router.push(`/${id}`);
      router.refresh(); // pull the new DM into the rail's server-rendered list
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not open DM");
      setDmBusy(null);
    }
  }

  async function genInvite() {
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_invite", { p_space_id: spaceId });
    setBusy(false);
    if (error) return alert(error.message);
    setInvite(`${window.location.origin}/join/${data}`);
  }

  async function changeRole(userId: string, role: string) {
    const { error } = await supabase.rpc("set_member_role", { p_space_id: spaceId, p_user_id: userId, p_role: role });
    if (error) return alert(error.message);
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Remove this member?")) return;
    const { error } = await supabase.rpc("remove_member", { p_space_id: spaceId, p_user_id: userId });
    if (error) return alert(error.message);
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", fontFamily: "system-ui, sans-serif", color: "#ddd" }}>
      <h1 style={{ fontSize: 18, color: "#fff", margin: "0 0 4px" }}>{spaceName}</h1>
      <div style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>{members.length} member{members.length === 1 ? "" : "s"}</div>

      {canManage && (
        <div style={{ marginBottom: 24 }}>
          <button onClick={genInvite} disabled={busy} style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14 }}>
            {busy ? "…" : "Generate invite link"}
          </button>
          {invite && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
              <input readOnly value={invite} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, maxWidth: 420, background: "#141414", border: "1px solid #333", borderRadius: 6, padding: "6px 10px", color: "#ededed", fontSize: 13 }} />
              <button onClick={() => navigator.clipboard?.writeText(invite)} style={{ background: "#222", color: "#ddd", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>copy</button>
            </div>
          )}
        </div>
      )}

      <div>
        {members.map((m) => {
          const isOwner = m.role === "owner";
          const isSelf = m.user_id === me;
          const editable = canManage && !isOwner && !isSelf;
          const label = (m.profiles?.display_name ?? "?").trim();
          return (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #222" }}>
              {m.profiles?.avatar_url ? (
                <img src={m.profiles.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#333", color: "#ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                  {label.slice(0, 2).toUpperCase() || "?"}
                </div>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "#fff", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label || "Member"}
                  {isSelf && <span style={{ color: "#666" }}> (you)</span>}
                </span>
                {m.profiles?.status_line && (
                  <span style={{ color: "#777", fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.profiles.status_line}</span>
                )}
              </span>
              {!isSelf && (
                <button onClick={() => message(m.user_id)} disabled={dmBusy === m.user_id} style={{ background: "#232338", color: "#c7c9ff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  {dmBusy === m.user_id ? "…" : "message"}
                </button>
              )}
              {editable ? (
                <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} style={{ background: "#141414", color: "#ddd", border: "1px solid #333", borderRadius: 6, padding: "4px 8px" }}>
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <span style={{ color: "#888", fontSize: 13, textTransform: "capitalize" }}>{m.role}</span>
              )}
              {editable && (
                <button onClick={() => removeMember(m.user_id)} style={{ background: "none", border: "1px solid #4a2020", color: "#f87171", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>
                  remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
