"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUI } from "@/components/ui-provider";

type Reminder = { id: string; title: string; remind_at: string | null; done: boolean; created_by: string; created_at: string };

function whenLabel(iso: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = then - Date.now();
  const overdue = diff < 0;
  const mins = Math.abs(diff) / 60000;
  let mag: string;
  if (mins < 60) mag = `${Math.max(Math.round(mins), 1)}m`;
  else if (mins < 1440) mag = `${Math.round(mins / 60)}h`;
  else mag = `${Math.round(mins / 1440)}d`;
  const nice = new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  return { text: overdue ? `${nice} · ${mag} ago` : `${nice} · in ${mag}`, overdue };
}

export function RemindersChannel({ channelId, channelName, me }: { channelId: string; channelName: string; me: string }) {
  const supabase = useMemo(() => createClient(), []);
  const ui = useUI();
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("reminders").select("id, title, remind_at, done, created_by, created_at").eq("channel_id", channelId);
    setItems((data ?? []) as Reminder[]);
    setLoading(false);
  }, [channelId, supabase]);

  useEffect(() => {
    // Initial fetch on mount / channel change — legitimate data-loading effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`reminders:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders", filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id: string };
          setItems((prev) => prev.filter((r) => r.id !== old.id));
          return;
        }
        const row = payload.new as Reminder;
        setItems((prev) => {
          const i = prev.findIndex((r) => r.id === row.id);
          if (i === -1) return [...prev, row];
          const copy = prev.slice();
          copy[i] = row;
          return copy;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, supabase]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("reminders")
      .insert({ channel_id: channelId, title: t, remind_at: when ? new Date(when).toISOString() : null, created_by: me })
      .select("id, title, remind_at, done, created_by, created_at")
      .single();
    setAdding(false);
    if (error) {
      ui.alert(error.message, 'Error');
      return;
    }
    ui.toast('Reminder added!', 'success');
    setItems((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Reminder]));
    setTitle("");
    setWhen("");
  }

  async function toggle(r: Reminder) {
    const before = items;
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)));
    const { error } = await supabase.from("reminders").update({ done: !r.done }).eq("id", r.id);
    if (error) {
      setItems(before);
      ui.alert(error.message, 'Error');
    }
  }

  async function remove(id: string) {
    const before = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) {
      setItems(before);
      ui.alert(error.message, 'Error');
    }
  }

  // Open reminders first, soonest remind_at at the top (undated last); done sink to the bottom.
  const sorted = [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.remind_at && b.remind_at) return new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime();
    if (a.remind_at) return -1;
    if (b.remind_at) return 1;
    return 0;
  });

  const total = items.length;
  const completed = items.filter((r) => r.done).length;
  const openCount = total - completed;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minWidth: 0,
      background: "var(--background)",
      fontFamily: "var(--font-sans)",
      transition: "background-color 0.15s ease"
    }}>
      {/* Header with stats and progress */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>[⏰]</span>
            <span style={{
              fontFamily: "var(--display-font)",
              fontSize: 18,
              fontWeight: 800,
              color: "var(--foreground)"
            }}>
              {channelName}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            <span style={{
              background: openCount > 0 ? "var(--accent-soft)" : "var(--success-soft)",
              color: openCount > 0 ? "var(--accent)" : "var(--success)",
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700
            }}>
              {openCount} {openCount === 1 ? "open reminder" : "open reminders"}
            </span>
            {total > 0 && (
              <span style={{ color: "var(--muted)" }}>
                {progressPercent}% Complete
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {total > 0 && (
          <div style={{
            height: 4,
            width: "100%",
            background: "var(--border-soft)",
            borderRadius: 2,
            overflow: "hidden",
            marginTop: 2
          }}>
            <div style={{
              height: "100%",
              background: "var(--accent)",
              width: `${progressPercent}%`,
              borderRadius: 2,
              transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
            }} />
          </div>
        )}
      </div>

      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 24px 48px",
        display: "flex",
        flexDirection: "column",
        gap: 24
      }}>
        <div style={{
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24
        }}>
          {/* Custom Reminder Form Card */}
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 1px 3px var(--shadow)"
          }}>
            <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Create New Reminder
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Remind the team to…"
                  style={{
                    flex: "1 1 240px",
                    minWidth: 180,
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "var(--foreground)",
                    fontSize: 14,
                    outline: "none",
                    transition: "border-color 0.15s ease"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                />
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  title="Reminder schedule"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    color: when ? "var(--foreground)" : "var(--muted)",
                    fontSize: 13,
                    outline: "none",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                />
                <button
                  type="submit"
                  disabled={adding || !title.trim()}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    cursor: (adding || !title.trim()) ? "default" : "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    opacity: (adding || !title.trim()) ? 0.6 : 1,
                    transition: "background-color 0.15s ease"
                  }}
                  onMouseEnter={(e) => { if (!adding && title.trim()) e.currentTarget.style.background = "var(--accent-hover)" }}
                  onMouseLeave={(e) => { if (!adding && title.trim()) e.currentTarget.style.background = "var(--accent)" }}
                >
                  {adding ? "Adding..." : "Schedule"}
                </button>
              </div>
            </form>
          </div>

          {/* Reminders List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading && (
              <div style={{
                textAlign: "center",
                padding: "24px 0",
                color: "var(--faint)",
                fontFamily: "var(--font-mono)",
                fontSize: 12
              }}>
                [ LOADING REMINDERS... ]
              </div>
            )}

            {!loading && sorted.length === 0 && (
              <div style={{
                textAlign: "center",
                padding: "48px 24px",
                border: "1px dashed var(--border)",
                borderRadius: 12,
                color: "var(--muted)",
                fontSize: 14
              }}>
                No reminders scheduled yet. Add one above to notify the team.
              </div>
            )}

            {!loading && sorted.map((r) => {
              const w = whenLabel(r.remind_at);
              const cardBg = r.done ? "var(--card)" : w?.overdue ? "var(--danger-soft)" : "var(--card)";
              const leftBorderColor = r.done ? "var(--border)" : w?.overdue ? "var(--danger)" : "var(--accent)";

              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 20px",
                    background: cardBg,
                    border: "1px solid var(--border)",
                    borderLeft: `4px solid ${leftBorderColor}`,
                    borderRadius: 12,
                    boxShadow: "0 1px 2px var(--shadow)",
                    transition: "all 0.15s ease",
                    opacity: r.done ? 0.75 : 1
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 3px 8px var(--shadow-lg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0px)";
                    e.currentTarget.style.boxShadow = "0 1px 2px var(--shadow)";
                  }}
                >
                  {/* Round animated checkbox */}
                  <button
                    onClick={() => toggle(r)}
                    title={r.done ? "Mark as open" : "Mark as completed"}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: `2px solid ${r.done ? "var(--success)" : "var(--border)"}`,
                      background: r.done ? "var(--success)" : "transparent",
                      color: "#fff",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      transition: "all 0.15s ease",
                      padding: 0,
                      outline: "none"
                    }}
                    onMouseEnter={(e) => {
                      if (!r.done) e.currentTarget.style.borderColor = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      if (!r.done) e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    {r.done && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: r.done ? "var(--faint)" : "var(--foreground)",
                      fontSize: 14.5,
                      fontWeight: r.done ? 500 : 600,
                      textDecoration: r.done ? "line-through" : "none",
                      wordBreak: "break-word",
                      lineHeight: 1.4
                    }}>
                      {r.title}
                    </div>
                    {w && (
                      <div style={{
                        color: r.done ? "var(--faint)" : w.overdue ? "var(--danger)" : "var(--muted)",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        marginTop: 4,
                        textTransform: "uppercase",
                        letterSpacing: "0.03em"
                      }}>
                        {w.text}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => remove(r.id)}
                    title="Remove reminder"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--danger)",
                      cursor: "pointer",
                      fontSize: 16,
                      flexShrink: 0,
                      padding: 8,
                      opacity: 0.5,
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 6
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "1";
                      e.currentTarget.style.background = "var(--danger-soft)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

