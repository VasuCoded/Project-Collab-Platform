/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

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
  { key: "todo", label: "To do", accent: "#6b7280" },
  { key: "in_progress", label: "In progress", accent: "#4f46e5" },
  { key: "done", label: "Done", accent: "#22c55e" },
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
      alert(error.message);
      return;
    }
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
      alert(error.message);
    }
  }

  async function remove(id: string) {
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      setTasks(before);
      alert(error.message);
    }
  }

  const byStatus = (s: Status) => tasks.filter((t) => t.status === s);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "#0a0a0a", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #262626", display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "#fff" }}>☑ {channelName}</span>
        <span style={{ fontSize: 12, color: "#777" }}>{tasks.filter((t) => t.status !== "done").length} open</span>
      </div>

      <form onSubmit={addTask} style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: "1px solid #1c1c1c", flexWrap: "wrap" }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          style={{ flex: "1 1 240px", minWidth: 160, background: "#141414", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#ededed", fontSize: 14 }}
        />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Assign to" style={{ background: "#141414", border: "1px solid #333", borderRadius: 8, padding: "8px 10px", color: assignee ? "#ededed" : "#888", fontSize: 13 }}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me ? "Me" : m.name}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date" style={{ background: "#141414", border: "1px solid #333", borderRadius: 8, padding: "8px 10px", color: due ? "#ededed" : "#888", fontSize: 13, colorScheme: "dark" }} />
        <button type="submit" disabled={adding || !title.trim()} style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, opacity: adding || !title.trim() ? 0.6 : 1 }}>
          {adding ? "…" : "Add"}
        </button>
      </form>

      <div style={{ flex: 1, overflow: "auto", display: "flex", gap: 14, padding: 16, alignItems: "flex-start" }}>
        {COLUMNS.map((col) => {
          const items = byStatus(col.key);
          return (
            <div key={col.key} style={{ flex: "1 1 0", minWidth: 240, background: "#111", border: "1px solid #222", borderRadius: 12, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
              <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #1f1f1f" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.accent }} />
                <span style={{ color: "#ddd", fontSize: 13, fontWeight: 700 }}>{col.label}</span>
                <span style={{ color: "#666", fontSize: 12 }}>{items.length}</span>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {loading && <div style={{ color: "#555", fontSize: 13, padding: 8 }}>loading…</div>}
                {!loading && items.length === 0 && <div style={{ color: "#4a4a4a", fontSize: 13, padding: "10px 8px" }}>—</div>}
                {items.map((t) => {
                  const owner = t.owner_id ? memberById.get(t.owner_id) : null;
                  const d = dueLabel(t.due_at);
                  return (
                    <div key={t.id} style={{ background: "#181818", border: "1px solid #262626", borderRadius: 10, padding: "10px 11px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ color: t.status === "done" ? "#8a8a8a" : "#ededed", fontSize: 14, lineHeight: 1.35, textDecoration: t.status === "done" ? "line-through" : "none", wordBreak: "break-word" }}>{t.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {owner ? (
                          <span title={owner.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#bcbcbc", fontSize: 12 }}>
                            {owner.avatar ? (
                              <img src={owner.avatar} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
                            ) : (
                              <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#333", color: "#ccc", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{initials(owner.name)}</span>
                            )}
                            {owner.id === me ? "You" : owner.name}
                          </span>
                        ) : (
                          <button onClick={() => patch(t.id, { owner_id: me })} style={{ background: "none", border: "1px dashed #3a3a3a", color: "#888", borderRadius: 999, padding: "1px 8px", fontSize: 11, cursor: "pointer" }}>
                            claim
                          </button>
                        )}
                        {d && <span style={{ fontSize: 11, fontWeight: 600, color: d.overdue && t.status !== "done" ? "#f87171" : "#8a8a8a" }}>{d.text}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        {PREV[t.status] && (
                          <button onClick={() => patch(t.id, { status: PREV[t.status]! })} title="Move back" style={arrowBtn}>
                            ←
                          </button>
                        )}
                        {NEXT[t.status] && (
                          <button onClick={() => patch(t.id, { status: NEXT[t.status]! })} title="Move forward" style={arrowBtn}>
                            →
                          </button>
                        )}
                        <button onClick={() => remove(t.id)} title="Delete" style={{ ...arrowBtn, marginLeft: "auto", color: "#a15" }}>
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
  background: "#202020",
  border: "1px solid #303030",
  color: "#bbb",
  borderRadius: 6,
  padding: "2px 9px",
  fontSize: 13,
  cursor: "pointer",
  lineHeight: 1.2,
};
