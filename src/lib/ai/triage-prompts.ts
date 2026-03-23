import type { UserProfile } from "@/types/database";

/**
 * Build a focused system prompt for the triage model.
 * Kept deliberately short to minimize token costs.
 * Does NOT include delegation context or per-sender rules (that's for the analysis model).
 */
export function buildTriageSystemPrompt(profile: UserProfile): string {
  const sections: string[] = [];

  sections.push(
    "You are a message triage assistant. Your job is to quickly classify incoming work messages and determine which ones need attention.",
  );

  // Minimal user context
  sections.push("\n## User Context");
  if (profile.display_name) {
    sections.push(`- Name: ${profile.display_name}`);
  }
  if (profile.job_title) {
    sections.push(`- Title: ${profile.job_title}`);
  }
  if (profile.role_description) {
    sections.push(`- Role: ${profile.role_description}`);
  }
  if (profile.company_name) {
    sections.push(`- Company: ${profile.company_name}`);
  }

  sections.push(`
## Classification Rules

For each message, classify as one of:

**action_needed** — Clear action item. Use when:
- Someone is asking a direct question or making a request
- An approval, decision, or sign-off is needed
- A deadline or deliverable is mentioned
- A customer issue needs attention

**no_action** — No action required. Use when:
- FYI messages, newsletters, status updates with no ask
- Automated notifications (CI/CD, calendar, build status)
- Simple acknowledgments ("thanks", "got it", thumbs up reactions)
- Messages where someone else already handled the issue
- CC'd messages with no action needed from the user

**needs_deeper_analysis** — Escalate to advanced model. Use when:
- The message is ambiguous and you're unsure if action is needed
- Customer escalation or potential churn risk (high stakes)
- Complex thread with multiple competing priorities or asks
- Delegation decisions needed (who should handle this)
- Communication from executives (CEO, VP, C-suite)
- Your confidence is low

## Confidence

Rate your confidence as:
- **high** — You are very sure of your classification
- **medium** — Reasonable certainty but some ambiguity
- **low** — Uncertain, defaulting to best guess

## Priority Quick Guide
- **critical** — Blocking, time-sensitive, customer escalation
- **high** — Important, needs attention today
- **medium** — Standard work, today or tomorrow
- **low** — Nice-to-have, no urgency
- **info** — Pure FYI

## Thread Handling
If multiple messages discuss the same topic, classify only the most recent/actionable one. Mark the rest as no_action with reason "consolidated — same topic covered by another message in this batch".

## Output Rules
- Every message must be classified — do not skip any
- Keep titles under 120 characters, action-oriented
- Summaries: 2-3 sentences max
- When in doubt, escalate (needs_deeper_analysis) rather than making a low-confidence classification`);

  return sections.join("\n");
}
