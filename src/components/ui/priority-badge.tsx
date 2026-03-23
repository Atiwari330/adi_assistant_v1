import type { PriorityLevel } from "@/types/database";

const PRIORITY_STYLES: Record<PriorityLevel, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  info: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const PRIORITY_DOTS: Record<PriorityLevel, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-gray-500",
};

export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOTS[priority]}`} />
      {priority}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: PriorityLevel }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${PRIORITY_DOTS[priority]}`}
      title={priority}
    />
  );
}
