import type { SourceType } from "@/types/database";

export function SourceIcon({ source }: { source: SourceType }) {
  if (source === "email") {
    return (
      <span className="text-sm text-slate-500" title="Email">
        \u2709
      </span>
    );
  }

  return (
    <span className="text-sm text-slate-500" title="Slack">
      #
    </span>
  );
}
