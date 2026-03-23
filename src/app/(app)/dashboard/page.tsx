"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { ActionTypeBadge } from "@/components/ui/action-type-badge";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ActionStatus, PriorityLevel, ActionType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface ActionItemRow {
  id: string;
  title: string;
  summary: string | null;
  action_type: ActionType;
  priority: PriorityLevel;
  status: ActionStatus;
  delegate_reason: string | null;
  ai_reasoning: string | null;
  due_date: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  suggested_delegate: string | null;
  suggested_delegate_name: string | null;
  metadata: Record<string, unknown>;
}

type FilterTab = "active" | "critical" | "high" | "done";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "done", label: "Done" },
];

export default function DashboardPage() {
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [stats, setStats] = useState<{ active: number; byPriority: Record<string, number> } | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/action-items?pageSize=50";
      if (activeTab === "critical") url += "&priority=critical";
      else if (activeTab === "high") url += "&priority=high";
      else if (activeTab === "done") url += "&status=done";

      const res = await fetch(url);
      const data = await res.json();
      setItems(data.data ?? []);
    } catch (err) {
      console.error("Failed to fetch action items:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/action-items/stats");
      const data = await res.json();
      setStats(data.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  // Listen for realtime updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("action-items-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "action_items" },
        () => {
          fetchItems();
          fetchStats();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems, fetchStats]);

  async function handleQuickAction(id: string, status: "done" | "dismissed") {
    // Prevent double-clicks
    if (dismissingIds.has(id)) return;
    setDismissingIds((prev) => new Set(prev).add(id));

    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }

      // Remove from current view after a brief animation delay
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        fetchStats();
      }, 300);
    } catch (err) {
      console.error("Failed to update item:", err);
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {stats && (
        <div className="flex gap-3 text-sm">
          <span className="text-slate-400">
            <span className="font-semibold text-white">{stats.active}</span> active
          </span>
          {stats.byPriority?.critical ? (
            <span className="text-red-400">
              {stats.byPriority.critical} critical
            </span>
          ) : null}
          {stats.byPriority?.high ? (
            <span className="text-orange-400">
              {stats.byPriority.high} high
            </span>
          ) : null}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-900 p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          {activeTab === "active"
            ? "No active action items. You're all caught up!"
            : `No ${activeTab} items.`}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ActionItemCard
              key={item.id}
              item={item}
              isDismissing={dismissingIds.has(item.id)}
              onDone={() => handleQuickAction(item.id, "done")}
              onDismiss={() => handleQuickAction(item.id, "dismissed")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionItemCard({
  item,
  isDismissing,
  onDone,
  onDismiss,
}: {
  item: ActionItemRow;
  isDismissing: boolean;
  onDone: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`group rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-all duration-300 hover:border-slate-700 ${
        isDismissing ? "scale-95 opacity-0" : "scale-100 opacity-100"
      }`}
    >
      {/* Top row: priority + action type + time */}
      <div className="mb-2 flex items-center gap-2">
        <PriorityBadge priority={item.priority} />
        <ActionTypeBadge actionType={item.action_type} />
        <span className="flex-1" />
        <TimeAgo date={item.created_at} />
      </div>

      {/* Title — clickable to detail */}
      <Link href={`/items/${item.id}`}>
        <h3 className="mb-1 font-medium leading-snug text-white hover:text-blue-400">
          {item.title}
        </h3>
      </Link>

      {/* Summary */}
      {item.summary && (
        <p className="mb-3 text-sm leading-relaxed text-slate-400">
          {item.summary}
        </p>
      )}

      {/* Delegate suggestion */}
      {item.suggested_delegate_name && (
        <p className="mb-3 text-sm text-slate-500">
          Delegate to: <span className="text-slate-300">{item.suggested_delegate_name}</span>
          {item.delegate_reason && (
            <span className="text-slate-500"> — {item.delegate_reason}</span>
          )}
        </p>
      )}

      {/* Quick actions */}
      {item.status !== "done" && item.status !== "dismissed" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onDone}
            disabled={isDismissing}
            className="rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50"
          >
            Done
          </button>
          <button
            onClick={onDismiss}
            disabled={isDismissing}
            className="rounded-lg bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-700 disabled:opacity-50"
          >
            Dismiss
          </button>
          <Link
            href={`/items/${item.id}`}
            className="rounded-lg bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-700"
          >
            Details
          </Link>
        </div>
      )}
    </div>
  );
}
