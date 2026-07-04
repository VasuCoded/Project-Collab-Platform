"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

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
      alert(error.message);
      return;
    }
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
      alert(error.message);
    }
  }

  async function remove(id: string) {
    const before = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) {
      setItems(before);
      alert(error.message);
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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "#0a0a0a", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #262626", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 700, color: "#fff" }}>⏰ {channelName}</span>
        <span style={{ fontSize: 12, color: "#777" }}>{items.filter((r) => !r.done).length} open</span>
      </div>

      <form onSubmit={add} style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: "1px solid #1c1c1c", flexWrap: "wrap" }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Remind the team to…"
          style={{ flex: "1 1 240px", minWidth: 160, background: "#141414", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#ededed", fontSize: 14 }}
        />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} title="When" style={{ background: "#141414", border: "1px solid #333", borderRadius: 8, padding: "8px 10px", color: when ? "#ededed" : "#888", fontSize: 13, colorScheme: "dark" }} />
        <button type="submit" disabled={adding || !title.trim()} style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, opacity: adding || !title.trim() ? 0.6 : 1 }}>
          {adding ? "…" : "Add"}
        </button>
      </form>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {loading && <div style={{ color: "#555", fontSize: 13, padding: 10 }}>loading…</div>}
        {!loading && sorted.length === 0 && <div style={{ color: "#5a5a5a", fontSize: 14, textAlign: "center", marginTop: 32 }}>No reminders yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 720, margin: "0 auto" }}>
          {sorted.map((r) => {
            const w = whenLabel(r.remind_at);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "#141414", border: "1px solid #262626", borderRadius: 10, borderLeft: `3px solid ${r.done ? "#333" : w?.overdue ? "#ef4444" : "#4f46e5"}` }}>
                <button onClick={() => toggle(r)} title={r.done ? "Mark not done" : "Mark done"} style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${r.done ? "#22c55e" : "#555"}`, background: r.done ? "#22c55e" : "transparent", color: "#0a0a0a", cursor: "pointer", flexShrink: 0, fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {r.done ? "✓" : ""}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: r.done ? "#777" : "#ededed", fontSize: 14, textDecoration: r.done ? "line-through" : "none", wordBreak: "break-word" }}>{r.title}</div>
                  {w && <div style={{ color: r.done ? "#555" : w.overdue ? "#f87171" : "#8a8a8a", fontSize: 12, marginTop: 2 }}>{w.text}</div>}
                </div>
                <button onClick={() => remove(r.id)} title="Delete" style={{ background: "none", border: "none", color: "#a15", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
