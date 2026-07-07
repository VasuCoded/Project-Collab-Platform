/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startDm } from "@/app/(main)/actions";
import { useUI } from "@/components/ui-provider";

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
  const ui = useUI();
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
      router.refresh();
    } catch (e) {
      ui.alert(e instanceof Error ? e.message : "Could not open DM", 'Error');
      setDmBusy(null);
    }
  }

  async function genInvite() {
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_invite", { p_space_id: spaceId });
    setBusy(false);
    if (error) { ui.alert(error.message, 'Error'); return; }
    ui.toast('Invite link generated!', 'success')
    setInvite(`${window.location.origin}/join/${data}`);
  }

  async function changeRole(userId: string, role: string) {
    const { error } = await supabase.rpc("set_member_role", { p_space_id: spaceId, p_user_id: userId, p_role: role });
    if (error) { ui.alert(error.message, 'Error'); return; }
    ui.toast('Role updated.', 'success')
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
  }

  async function removeMember(userId: string) {
    const ok = await ui.confirm('Remove this member from the team? This cannot be undone.', 'Remove Member')
    if (!ok) return;
    const { error } = await supabase.rpc("remove_member", { p_space_id: spaceId, p_user_id: userId });
    if (error) { ui.alert(error.message, 'Error'); return; }
    ui.toast('Member removed.', 'success')
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", fontFamily: "var(--font-sans)", color: "var(--muted)", background: "var(--background)", height: "100%", transition: "background-color 0.15s ease" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px", fontFamily: "var(--display-font)" }}>{spaceName}</h1>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>{members.length} member{members.length === 1 ? "" : "s"}</div>

      {canManage && (
        <div style={{ marginBottom: 24 }}>
          <button onClick={genInvite} disabled={busy} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "background-color 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}>
            {busy ? "…" : "Generate invite link"}
          </button>
          {invite && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
              <input readOnly value={invite} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, maxWidth: 420, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", color: "var(--foreground)", fontSize: 13, outline: "none" }} />
              <button onClick={() => navigator.clipboard?.writeText(invite)} style={{ background: "var(--border-soft)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", cursor: "pointer", transition: "all 0.15s ease" }}>copy</button>
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth: 720 }}>
        {members.map((m) => {
          const isOwner = m.role === "owner";
          const isSelf = m.user_id === me;
          const editable = canManage && !isOwner && !isSelf;
          const label = (m.profiles?.display_name ?? "?").trim();
          return (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              {m.profiles?.avatar_url ? (
                <img src={m.profiles.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--border)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
                  {label.slice(0, 2).toUpperCase() || "?"}
                </div>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "var(--foreground)", fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label || "Member"}
                  {isSelf && <span style={{ color: "var(--faint)", fontWeight: 400 }}> (you)</span>}
                </span>
                {m.profiles?.status_line && (
                  <span style={{ color: "var(--muted)", fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.profiles.status_line}</span>
                )}
              </span>
              {!isSelf && (
                <button onClick={() => message(m.user_id)} disabled={dmBusy === m.user_id} style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--border)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent-soft)"}>
                  {dmBusy === m.user_id ? "…" : "message"}
                </button>
              )}
              {editable ? (
                <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", outline: "none" }}>
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <span style={{ color: "var(--muted)", fontSize: 13, textTransform: "capitalize" }}>{m.role}</span>
              )}
              {editable && (
                <button onClick={() => removeMember(m.user_id)} style={{ background: "var(--danger-soft)", border: "1px solid var(--border)", color: "var(--danger)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13, transition: "all 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--danger)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--danger-soft)"}>
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
