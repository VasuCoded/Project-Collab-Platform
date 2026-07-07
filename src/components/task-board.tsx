/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUI } from "@/components/ui-provider";

type Status = "todo" | "in_progress" | "done";
type Task = {
  id: string;
  title: string;
  status: Status;
  owner_id: string | null;
  due_at: string | null;
  created_by: string;
  created_at: string;
};
type Member = { id: string; name: string; avatar: string | null };

const COLUMNS: { key: Status; label: string; accent: string }[] = [
  { key: "todo", label: "To do", accent: "var(--muted)" },
  { key: "in_progress", label: "In progress", accent: "var(--accent)" },
  { key: "done", label: "Done", accent: "var(--success)" },
];

const NEXT: Record<Status, Status | null> = { todo: "in_progress", in_progress: "done", done: null };
const PREV: Record<Status, Status | null> = { todo: null, in_progress: "todo", done: "in_progress" };

function initials(name: string) {
  return (name || "?").trim().slice(0, 2).toUpperCase() || "?";
}

function dueLabel(iso: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = then - Date.now();
  const overdue = diff < 0;
  const days = Math.round(Math.abs(diff) / 86400000);
  const hrs = Math.round(Math.abs(diff) / 3600000);
  const mag = hrs < 24 ? `${Math.max(hrs, 1)}h` : `${days}d`;
  return { text: overdue ? `${mag} overdue` : `due ${mag}`, overdue };
}

export function TaskBoard({ spaceId, channelId, channelName, me }: { spaceId: string; channelId: string; channelName: string; me: string }) {
  const supabase = useMemo(() => createClient(), []);
  const ui = useUI();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [due, setDue] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const load = useCallback(async () => {
    const [{ data: taskRows }, { data: memberRows }] = await Promise.all([
      supabase.from("tasks").select("id, title, status, owner_id, due_at, created_by, created_at").eq("space_id", spaceId).order("created_at", { ascending: true }),
      supabase.from("space_members").select("user_id").eq("space_id", spaceId),
    ]);
    setTasks((taskRows ?? []) as Task[]);

    const ids = (memberRows ?? []).map((r) => r.user_id as string);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids);
      setMembers((profs ?? []).map((p) => ({ id: p.id, name: p.display_name ?? "Member", avatar: p.avatar_url })));
    }
    setLoading(false);
  }, [spaceId, supabase]);

  useEffect(() => {
    // Initial fetch on mount / channel change — legitimate data-loading effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Best-effort realtime: if the tasks table is published, other members' edits
  // stream in. If it isn't, local optimistic updates still keep this user in sync.
  useEffect(() => {
    const ch = supabase
      .channel(`tasks:${spaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `space_id=eq.${spaceId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id: string };
          setTasks((prev) => prev.filter((t) => t.id !== old.id));
          return;
        }
        const row = payload.new as Task;
        setTasks((prev) => {
          const i = prev.findIndex((t) => t.id === row.id);
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
  }, [spaceId, supabase]);

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({ space_id: spaceId, channel_id: channelId, title: t, owner_id: assignee || null, due_at: due ? new Date(due).toISOString() : null, created_by: me, status: "todo" })
      .select("id, title, status, owner_id, due_at, created_by, created_at")
      .single();
    setAdding(false);
    if (error) {
      ui.alert(error.message, 'Error');
      return;
    }
    ui.toast('Task added!', 'success');
    setTasks((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Task]));
    setTitle("");
    setAssignee("");
    setDue("");
  }

  async function patch(id: string, changes: Partial<Task>) {
    const before = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t))); // optimistic
    const { error } = await supabase.from("tasks").update(changes).eq("id", id);
    if (error) {
      setTasks(before); // roll back
      ui.alert(error.message, 'Error');
    }
  }

  async function remove(id: string) {
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setTasks(before);
      ui.alert(error.message, 'Error');
    }
  }

  const byStatus = (s: Status) => tasks.filter((t) => t.status === s);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "var(--background)", fontFamily: "var(--font-sans)", transition: "background-color 0.15s ease" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--foreground)" }}>☑ {channelName}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{tasks.filter((t) => t.status !== "done").length} open</span>
      </div>

      <form onSubmit={addTask} style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          style={{ flex: "1 1 240px", minWidth: 160, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--foreground)", fontSize: 14, outline: "none" }}
        />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Assign to" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: assignee ? "var(--foreground)" : "var(--muted)", fontSize: 13, outline: "none" }}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me ? "Me" : m.name}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: due ? "var(--foreground)" : "var(--muted)", fontSize: 13, outline: "none" }} />
        <button type="submit" disabled={adding || !title.trim()} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, opacity: adding || !title.trim() ? 0.6 : 1, transition: "background-color 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}>
          {adding ? "…" : "Add"}
        </button>
      </form>

      <div style={{ flex: 1, overflow: "auto", display: "flex", gap: 14, padding: 16, alignItems: "flex-start" }}>
        {COLUMNS.map((col) => {
          const items = byStatus(col.key);
          return (
            <div key={col.key} style={{ flex: "1 1 0", minWidth: 240, background: "var(--sidebar)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", maxHeight: "100%", boxShadow: "0 4px 12px var(--shadow)" }}>
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.accent }} />
                <span style={{ color: "var(--foreground)", fontSize: 13, fontWeight: 700 }}>{col.label}</span>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>{items.length}</span>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {loading && <div style={{ color: "var(--faint)", fontSize: 13, padding: 8 }}>loading…</div>}
                {!loading && items.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13, padding: "10px 8px" }}>—</div>}
                {items.map((t) => {
                  const owner = t.owner_id ? memberById.get(t.owner_id) : null;
                  const d = dueLabel(t.due_at);
                  return (
                    <div key={t.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 11px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 2px 4px var(--shadow)", transition: "transform 0.15s ease" }} onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"} onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0px)"}>
                      <div style={{ color: t.status === "done" ? "var(--faint)" : "var(--foreground)", fontSize: 14, lineHeight: 1.35, textDecoration: t.status === "done" ? "line-through" : "none", wordBreak: "break-word" }}>{t.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {owner ? (
                          <span title={owner.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)", fontSize: 12 }}>
                            {owner.avatar ? (
                              <img src={owner.avatar} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
                            ) : (
                              <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--border)", color: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{initials(owner.name)}</span>
                            )}
                            {owner.id === me ? "You" : owner.name}
                          </span>
                        ) : (
                          <button onClick={() => patch(t.id, { owner_id: me })} style={{ background: "none", border: "1px dashed var(--border)", color: "var(--accent)", borderRadius: 999, padding: "1px 8px", fontSize: 11, cursor: "pointer", transition: "all 0.15s ease" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border-soft)" }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}>
                            claim
                          </button>
                        )}
                        {d && <span style={{ fontSize: 11, fontWeight: 600, color: d.overdue && t.status !== "done" ? "var(--danger)" : "var(--muted)" }}>{d.text}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        {PREV[t.status] && (
                          <button onClick={() => patch(t.id, { status: PREV[t.status]! })} title="Move back" style={arrowBtn} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)" }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--border-soft)" }}>
                            ←
                          </button>
                        )}
                        {NEXT[t.status] && (
                          <button onClick={() => patch(t.id, { status: NEXT[t.status]! })} title="Move forward" style={arrowBtn} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)" }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--border-soft)" }}>
                            →
                          </button>
                        )}
                        <button onClick={() => remove(t.id)} title="Delete" style={{ ...arrowBtn, marginLeft: "auto", color: "var(--danger)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-soft)" }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--border-soft)" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  background: "var(--border-soft)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  borderRadius: 6,
  padding: "2px 9px",
  fontSize: 13,
  cursor: "pointer",
  lineHeight: 1.2,
  transition: "all 0.15s ease",
};
