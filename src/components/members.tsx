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

function initials(name: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

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
  const [copied, setCopied] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admins" | "moderators" | "members">("all");

  const canManage = myRole === "owner" || myRole === "admin";

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const name = (m.profiles?.display_name ?? "").toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      if (query && !name.includes(query)) return false;

      if (roleFilter === "admins") {
        return m.role === "owner" || m.role === "admin";
      }
      if (roleFilter === "moderators") {
        return m.role === "moderator";
      }
      if (roleFilter === "members") {
        return m.role === "member";
      }
      return true; // "all"
    });
  }, [members, searchQuery, roleFilter]);

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
    ui.toast('Invite link generated!', 'success');
    setInvite(`${window.location.origin}/join/${data}`);
  }

  async function handleCopy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      ui.toast('Invite link copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      ui.toast('Failed to copy link', 'error');
    }
  }

  async function changeRole(userId: string, role: string) {
    const { error } = await supabase.rpc("set_member_role", { p_space_id: spaceId, p_user_id: userId, p_role: role });
    if (error) { ui.alert(error.message, 'Error'); return; }
    ui.toast('Role updated.', 'success');
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
  }

  async function removeMember(userId: string) {
    const ok = await ui.confirm('Remove this member from the team? This cannot be undone.', 'Remove Member');
    if (!ok) return;
    const { error } = await supabase.rpc("remove_member", { p_space_id: spaceId, p_user_id: userId });
    if (error) { ui.alert(error.message, 'Error'); return; }
    ui.toast('Member removed.', 'success');
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      background: "var(--background)",
      height: "100%",
      transition: "background-color 0.15s ease",
      padding: '40px 32px 80px'
    }}>
      <div style={{
        maxWidth: 760,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Workspace Panel Header Card */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '24px 32px',
          boxShadow: '0 1px 3px var(--shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 24,
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Workspace badge */}
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              border: '1px solid rgba(14, 92, 70, 0.15)',
            }}>
              {initials(spaceName)}
            </div>
            <div>
              <h1 style={{
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--foreground)',
                margin: 0,
                fontFamily: 'var(--display-font)',
                letterSpacing: '-0.02em',
              }}>
                {spaceName}
              </h1>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 6,
                fontSize: 12,
                color: 'var(--muted)'
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--accent)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: 'var(--accent-soft)',
                  padding: '2px 8px',
                  borderRadius: 4
                }}>
                  [ {members.length} {members.length === 1 ? 'member' : 'members'} ]
                </span>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--faint)' }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                  Active Space
                </span>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--border-soft)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse-slow 2.5s infinite'
            }} />
            Live Synced
          </div>
        </div>

        {/* Invite Generator Portal */}
        {canManage && (
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 1px 3px var(--shadow)',
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>[INVITE]</span>
              <h3 style={{
                fontFamily: 'var(--display-font)',
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--foreground)',
                margin: 0
              }}>
                Add to Workspace
              </h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Generate an access link to invite collaborators to this team. Anyone with the link can sign up and join.
            </p>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={genInvite}
                disabled={busy}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  cursor: busy ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}
                onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent-hover)' }}
                onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent)' }}
              >
                {busy ? (
                  <>
                    <svg style={{ animation: 'spin 1.2s linear infinite', width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10" stroke="rgba(255, 255, 255, 0.2)" />
                      <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                    Generate Link
                  </>
                )}
              </button>

              {invite && (
                <div style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 280,
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '4px 6px 4px 12px',
                }}>
                  <input
                    readOnly
                    value={invite}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--foreground)',
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                  <button
                    onClick={handleCopy}
                    style={{
                      background: copied ? 'var(--success)' : 'var(--border-soft)',
                      color: copied ? '#fff' : 'var(--foreground)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 14px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {copied ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      'Copy'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter and Search controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap'
        }}>
          {/* Role filter tab buttons */}
          <div style={{
            display: 'flex',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            padding: 4,
            borderRadius: 8,
            boxShadow: '0 1px 3px var(--shadow)'
          }}>
            {(['all', 'admins', 'moderators', 'members'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRoleFilter(tab)}
                style={{
                  background: roleFilter === tab ? 'var(--accent-soft)' : 'transparent',
                  color: roleFilter === tab ? 'var(--accent)' : 'var(--muted)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  letterSpacing: '0.03em'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 260,
            minWidth: 200
          }}>
            <input
              type="text"
              placeholder="Search member..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--foreground)',
                outline: 'none',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px var(--shadow)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-soft)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = '0 1px 3px var(--shadow)';
              }}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--faint)'
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>

        {/* Member cards grid */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 1px 3px var(--shadow)',
          overflow: 'hidden'
        }}>
          {filteredMembers.length === 0 ? (
            <div style={{
              padding: '64px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 12
            }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--border-soft)',
                color: 'var(--faint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
                  No members found
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Try adjusting your search query or switching filters.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredMembers.map((m, index) => {
                const isOwner = m.role === "owner";
                const isSelf = m.user_id === me;
                const editable = canManage && !isOwner && !isSelf;
                const name = (m.profiles?.display_name ?? "?").trim();

                // Define role-specific styling
                let badgeBg = 'var(--border-soft)';
                let badgeBorder = 'var(--border)';
                let badgeColor = 'var(--muted)';

                if (m.role === 'owner') {
                  badgeBg = 'var(--warning-soft)';
                  badgeBorder = 'rgba(138, 94, 18, 0.2)';
                  badgeColor = 'var(--warning)';
                } else if (m.role === 'admin') {
                  badgeBg = 'rgba(139, 92, 246, 0.1)';
                  badgeBorder = 'rgba(139, 92, 246, 0.2)';
                  badgeColor = '#8b5cf6';
                } else if (m.role === 'moderator') {
                  badgeBg = 'rgba(59, 130, 246, 0.1)';
                  badgeBorder = 'rgba(59, 130, 246, 0.2)';
                  badgeColor = '#3b82f6';
                }

                return (
                  <div
                    key={m.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '16px 24px',
                      borderBottom: index === filteredMembers.length - 1 ? 'none' : '1px solid var(--border)',
                      transition: 'all 0.12s ease',
                      background: 'var(--card)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--border-soft)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--card)';
                    }}
                  >
                    {/* Avatar with dynamic indicator */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {m.profiles?.avatar_url ? (
                        <img src={m.profiles.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid rgba(14, 92, 70, 0.1)'
                        }}>
                          {initials(name)}
                        </div>
                      )}
                      <span style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--success)',
                        border: '2px solid var(--card)',
                      }} />
                    </div>

                    {/* Member info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--foreground)', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name || "Member"}
                        </span>
                        {isSelf && (
                          <span style={{
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            padding: '1px 5px',
                            borderRadius: 4,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}>
                            You
                          </span>
                        )}
                      </div>
                      {m.profiles?.status_line ? (
                        <span style={{
                          color: 'var(--muted)',
                          fontSize: 12,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 2,
                          fontStyle: 'italic'
                        }}>
                          &ldquo;{m.profiles.status_line}&rdquo;
                        </span>
                      ) : (
                        <span style={{ color: 'var(--faint)', fontSize: 11, display: 'block', marginTop: 2 }}>
                          No custom status
                        </span>
                      )}
                    </div>

                    {/* Actions and role controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      {/* Direct Message button */}
                      {!isSelf && (
                        <button
                          onClick={() => message(m.user_id)}
                          disabled={dmBusy === m.user_id}
                          title={`Message ${name}`}
                          style={{
                            background: 'var(--border-soft)',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: dmBusy === m.user_id ? 'default' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (dmBusy !== m.user_id) {
                              e.currentTarget.style.borderColor = 'var(--accent)';
                              e.currentTarget.style.color = 'var(--accent)';
                              e.currentTarget.style.background = 'var(--accent-soft)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (dmBusy !== m.user_id) {
                              e.currentTarget.style.borderColor = 'var(--border)';
                              e.currentTarget.style.color = 'var(--foreground)';
                              e.currentTarget.style.background = 'var(--border-soft)';
                            }
                          }}
                        >
                          {dmBusy === m.user_id ? (
                            <svg style={{ animation: 'spin 1.2s linear infinite', width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <circle cx="12" cy="12" r="10" stroke="rgba(0, 0, 0, 0.15)" />
                              <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          )}
                        </button>
                      )}

                      {/* Dropdown role or status badge */}
                      {editable ? (
                        <div style={{ position: 'relative' }}>
                          <select
                            value={m.role}
                            onChange={(e) => changeRole(m.user_id, e.target.value)}
                            style={{
                              background: 'var(--card)',
                              color: 'var(--foreground)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: '6px 28px 6px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              outline: 'none',
                              cursor: 'pointer',
                              appearance: 'none',
                              textTransform: 'capitalize',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                          >
                            {ASSIGNABLE.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              pointerEvents: 'none',
                              color: 'var(--faint)'
                            }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      ) : (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: badgeBg,
                          border: `1px solid ${badgeBorder}`,
                          color: badgeColor
                        }}>
                          {m.role}
                        </span>
                      )}

                      {/* Remove member button */}
                      {editable && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          title={`Remove ${name}`}
                          style={{
                            background: 'var(--danger-soft)',
                            border: '1px solid rgba(178, 58, 38, 0.15)',
                            color: 'var(--danger)',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--danger)';
                            e.currentTarget.style.color = '#fff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--danger-soft)';
                            e.currentTarget.style.color = 'var(--danger)';
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

