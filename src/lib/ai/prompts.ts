import type { UserProfile, Contact, ProcessingRule, SourceMessage } from "@/types/database";

/**
 * Build the system prompt with user context and applicable rules.
 */
export function buildSystemPrompt(
  profile: UserProfile,
  contacts: Contact[],
  rules: ProcessingRule[],
): string {
  const sections: string[] = [];

  // Core role
  sections.push(`You are an executive AI assistant for ${profile.display_name ?? "the user"}.`);
  sections.push(
    "Your job is to analyze incoming work messages (email and Slack) and determine what action items require the user's attention.",
  );
  sections.push(
    "You think carefully about context, urgency, and the user's role to provide actionable, concise recommendations.",
  );

  // User context
  sections.push("\n## About the User");
  if (profile.job_title) {
    sections.push(`- **Title:** ${profile.job_title}`);
  }
  if (profile.role_description) {
    sections.push(`- **Role:** ${profile.role_description}`);
  }
  if (profile.company_name) {
    sections.push(`- **Company:** ${profile.company_name}`);
  }
  if (profile.company_description) {
    sections.push(`- **Company Context:** ${profile.company_description}`);
  }
  if (profile.team_structure) {
    sections.push(`- **Team:** ${profile.team_structure}`);
  }

  // Work preferences
  const prefs = profile.work_preferences as Record<string, unknown> | null;
  if (prefs && Object.keys(prefs).length > 0) {
    sections.push("\n## Work Preferences");
    for (const [key, value] of Object.entries(prefs)) {
      if (value) {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        sections.push(`- **${label}:** ${String(value)}`);
      }
    }
  }

  // Known contacts (for delegation context)
  const delegates = contacts.filter((c) => c.is_delegate);
  if (delegates.length > 0) {
    sections.push("\n## Team Members Available for Delegation");
    for (const contact of delegates) {
      const parts = [`- **${contact.full_name}**`];
      if (contact.job_title) parts.push(`(${contact.job_title})`);
      if (contact.relationship) parts.push(`— ${contact.relationship.replace("_", " ")}`);
      if (contact.notes) parts.push(`— ${contact.notes}`);
      sections.push(parts.join(" "));
    }
  }

  // Per-sender processing rules
  if (rules.length > 0) {
    sections.push("\n## Special Rules for Specific Senders");
    for (const rule of rules) {
      const parts = [`- Messages matching **${rule.match_type}** = \`${rule.match_value}\``];
      if (rule.priority_override) {
        parts.push(`→ Priority override: **${rule.priority_override}**`);
      }
      if (rule.delegate_to) {
        const delegate = contacts.find((c) => c.id === rule.delegate_to);
        if (delegate) {
          parts.push(`→ Delegate to: **${delegate.full_name}**`);
        }
      }
      if (rule.instruction_text) {
        parts.push(`→ ${rule.instruction_text}`);
      }
      sections.push(parts.join(" "));
    }
  }

  // Guidelines
  sections.push(`
## Action Item Guidelines

### What IS an action item:
- A message that asks a question requiring your response
- A request for approval, decision, or sign-off
- A task that needs to be delegated to someone on your team
- A customer issue that needs escalation or attention
- A deadline or meeting that needs preparation
- A thread where your input has been specifically requested

### What is NOT an action item:
- FYI messages, newsletters, or status updates with no ask
- Automated notifications (build status, CI/CD, calendar reminders)
- Messages where someone else has already handled the issue
- Threads where you were CC'd but no action is needed from you
- Read receipts, acknowledgments, or simple "thanks" messages

### Priority Assessment:
- **critical**: Blocking issue, customer escalation, time-sensitive decision (needs attention NOW)
- **high**: Important request from executive/customer, deadline within 24 hours
- **medium**: Standard work request, can be handled today or tomorrow
- **low**: Nice-to-have, informational with minor follow-up needed
- **info**: Pure FYI, no action needed but worth knowing about

### Delegation Guidelines:
- Only suggest delegation if the task falls outside the user's core responsibilities
- Match the delegate to their role (customer issues → customer success, technical issues → engineering)
- If a specific delegation rule exists for the sender, follow it
- Always explain why this person is the right delegate

### Output Rules:
- Keep titles under 120 characters
- Summaries should be 2-3 sentences max
- Be direct and action-oriented — "Approve $5K spend request from Sarah" not "Sarah sent a message about spending"
- If processing a thread, focus on the LATEST message and what it means for the user
- Every message must appear in either 'items' or 'noActionNeeded' — do not skip any`);

  return sections.join("\n");
}

/**
 * Build the user prompt containing the messages to analyze.
 */
export function buildUserPrompt(messages: SourceMessage[]): string {
  const parts = ["Analyze the following messages and extract action items:\n"];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    parts.push(`--- Message ${i} ---`);
    parts.push(`Source: ${msg.source === "email" ? "Email" : "Slack"}`);
    parts.push(`From: ${msg.sender_name ?? "Unknown"} <${msg.sender_address ?? "unknown"}>`);

    if (msg.source === "email" && msg.subject) {
      parts.push(`Subject: ${msg.subject}`);
    }
    if (msg.source === "slack" && msg.channel_name) {
      parts.push(`Channel: #${msg.channel_name}`);
    }

    parts.push(`Date: ${msg.message_timestamp}`);

    if (msg.thread_id) {
      parts.push(`[Part of a thread]`);
    }

    parts.push("");
    parts.push(msg.body_text ?? "(no content)");
    parts.push("");
  }

  return parts.join("\n");
}
