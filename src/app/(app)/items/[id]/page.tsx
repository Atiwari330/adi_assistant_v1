"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { ActionTypeBadge } from "@/components/ui/action-type-badge";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ActionType, PriorityLevel, ActionStatus } from "@/types/database";

interface SourceMessageDetail {
  id: string;
  source: "email" | "slack";
  sender_address: string | null;
  sender_name: string | null;
  channel_name: string | null;
  subject: string | null;
  body_text: string | null;
  message_timestamp: string;
  is_primary: boolean;
}

interface HistoryEntry {
  previous_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
}

interface ActionItemDetail {
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
  llm_model: string | null;
  created_at: string;
  updated_at: string;
  suggested_delegate: string | null;
  suggested_delegate_name: string | null;
  source_messages: SourceMessageDetail[];
  history: HistoryEntry[];
  metadata: Record<string, unknown>;
}

export default function ActionItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<ActionItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/action-items/${params.id}`);
        const data = await res.json();
        setItem(data.data);
      } catch (err) {
        console.error("Failed to load action item:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  async function updateStatus(status: ActionStatus) {
    setUpdating(true);
    try {
      await fetch(`/api/action-items/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (status === "done" || status === "dismissed") {
        router.push("/dashboard");
      } else {
        // Refresh
        const res = await fetch(`/api/action-items/${params.id}`);
        const data = await res.json();
        setItem(data.data);
      }
    } catch (err) {
      console.error("Failed to update:", err);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-500">Loading...</div>;
  }

  if (!item) {
    return <div className="py-12 text-center text-slate-500">Item not found</div>;
  }

  const isActive = !["done", "dismissed"].includes(item.status);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="text-sm text-slate-500 hover:text-slate-300"
      >
        &larr; Back
      </button>

      {/* Header */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={item.priority} />
          <ActionTypeBadge actionType={item.action_type} />
          <TimeAgo date={item.created_at} />
        </div>
        <h1 className="text-xl font-bold leading-snug">{item.title}</h1>
      </div>

      {/* Summary */}
      {item.summary && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-400">Summary</h2>
          <p className="leading-relaxed text-slate-200">{item.summary}</p>
        </div>
      )}

      {/* Delegation suggestion */}
      {item.suggested_delegate_name && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <h2 className="mb-1 text-sm font-semibold text-blue-400">Suggested Delegate</h2>
          <p className="text-slate-200">{item.suggested_delegate_name}</p>
          {item.delegate_reason && (
            <p className="mt-1 text-sm text-slate-400">{item.delegate_reason}</p>
          )}
        </div>
      )}

      {/* AI Reasoning */}
      {item.ai_reasoning && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-400">AI Reasoning</h2>
          <p className="text-sm leading-relaxed text-slate-300">{item.ai_reasoning}</p>
        </div>
      )}

      {/* Action buttons */}
      {isActive && (
        <div className="flex gap-2">
          <button
            onClick={() => updateStatus("done")}
            disabled={updating}
            className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Mark Done
          </button>
          <button
            onClick={() => updateStatus("acknowledged")}
            disabled={updating}
            className="flex-1 rounded-lg bg-slate-700 py-2.5 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
          >
            Acknowledge
          </button>
          <button
            onClick={() => updateStatus("dismissed")}
            disabled={updating}
            className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-700 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status badge for done/dismissed */}
      {!isActive && (
        <div className="rounded-lg bg-slate-900 p-3 text-center text-sm text-slate-400">
          Status: <span className="font-medium text-slate-300">{item.status}</span>
        </div>
      )}

      {/* Source messages */}
      {item.source_messages.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-400">Original Message</h2>
          {item.source_messages.map((msg) => (
            <div
              key={msg.id}
              className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
            >
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="text-slate-500">
                  {msg.source === "email" ? "\u2709" : "#"}
                </span>
                <span className="font-medium text-slate-300">
                  {msg.sender_name ?? msg.sender_address ?? "Unknown"}
                </span>
                {msg.source === "slack" && msg.channel_name && (
                  <span className="text-slate-500">in #{msg.channel_name}</span>
                )}
                <span className="flex-1" />
                <TimeAgo date={msg.message_timestamp} />
              </div>
              {msg.subject && (
                <p className="mb-2 text-sm font-medium text-slate-300">
                  {msg.subject}
                </p>
              )}
              {msg.body_text && (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
                  {msg.body_text.slice(0, 2000)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {item.history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-400">History</h2>
          <div className="space-y-2">
            {item.history.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-500">
                <span>
                  {entry.previous_status ?? "created"} &rarr; {entry.new_status}
                </span>
                <span className="flex-1" />
                <TimeAgo date={entry.created_at} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
