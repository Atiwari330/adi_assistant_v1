import type { ActionType } from "@/types/database";

const ACTION_LABELS: Record<ActionType, string> = {
  respond: "Respond",
  delegate: "Delegate",
  approve: "Approve",
  reject: "Reject",
  review: "Review",
  follow_up: "Follow Up",
  schedule: "Schedule",
  archive: "Archive",
  info_only: "FYI",
};

const ACTION_ICONS: Record<ActionType, string> = {
  respond: "\u21A9",   // ↩
  delegate: "\u2197",  // ↗
  approve: "\u2713",   // ✓
  reject: "\u2717",    // ✗
  review: "\u2606",    // ☆
  follow_up: "\u21BB", // ↻
  schedule: "\u2302",  // ⌂
  archive: "\u2193",   // ↓
  info_only: "\u2139", // ℹ
};

export function ActionTypeBadge({ actionType }: { actionType: ActionType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/50 px-2 py-0.5 text-xs font-medium text-slate-300">
      <span>{ACTION_ICONS[actionType]}</span>
      {ACTION_LABELS[actionType]}
    </span>
  );
}
