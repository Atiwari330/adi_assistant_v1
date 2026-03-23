import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FilterRule } from "@/types/database";
import { DEFAULT_EXCLUDED_SENDERS } from "@/lib/constants";

export interface FilterResult {
  shouldSkip: boolean;
  matchedRuleId: string | null;
  reason: string | null;
}

/**
 * Load all active filter rules for a user.
 */
export async function loadFilterRules(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FilterRule[]> {
  const { data } = await supabase
    .from("filter_rules")
    .select("id, user_id, rule_type, pattern, description, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true);

  return data ?? [];
}

/**
 * Check if an email message should be filtered out (skipped before LLM).
 */
export function checkEmailFilter(
  senderAddress: string | null,
  rules: FilterRule[],
): FilterResult {
  if (!senderAddress) {
    return { shouldSkip: false, matchedRuleId: null, reason: null };
  }

  const normalizedSender = senderAddress.toLowerCase().trim();

  // Check hardcoded default exclusions first
  for (const pattern of DEFAULT_EXCLUDED_SENDERS) {
    if (normalizedSender.startsWith(pattern) || normalizedSender.includes(pattern)) {
      return {
        shouldSkip: true,
        matchedRuleId: null,
        reason: `Default exclusion: sender matches '${pattern}'`,
      };
    }
  }

  // Extract domain from email
  const domain = normalizedSender.split("@")[1] ?? "";

  // Check user-defined filter rules
  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase().trim();

    switch (rule.rule_type) {
      case "exclude_domain":
        if (domain === pattern || domain.endsWith(`.${pattern}`)) {
          return {
            shouldSkip: true,
            matchedRuleId: rule.id,
            reason: `Rule: exclude domain '${rule.pattern}'`,
          };
        }
        break;

      case "exclude_address":
        // Support partial matching: "marketing@" matches any domain
        if (pattern.endsWith("@")) {
          const localPart = normalizedSender.split("@")[0];
          if (localPart === pattern.slice(0, -1)) {
            return {
              shouldSkip: true,
              matchedRuleId: rule.id,
              reason: `Rule: exclude address prefix '${rule.pattern}'`,
            };
          }
        } else if (normalizedSender === pattern) {
          return {
            shouldSkip: true,
            matchedRuleId: rule.id,
            reason: `Rule: exclude address '${rule.pattern}'`,
          };
        }
        break;
    }
  }

  return { shouldSkip: false, matchedRuleId: null, reason: null };
}

/**
 * Check if a Slack message from a specific channel should be filtered out.
 */
export function checkSlackFilter(
  channelId: string,
  senderUserId: string | null,
  rules: FilterRule[],
): FilterResult {
  for (const rule of rules) {
    if (rule.rule_type === "exclude_channel" && rule.pattern === channelId) {
      return {
        shouldSkip: true,
        matchedRuleId: rule.id,
        reason: `Rule: exclude channel '${rule.pattern}'`,
      };
    }
  }

  // Could also filter by Slack user if needed in the future
  if (senderUserId) {
    // Slack bots and integrations
    if (senderUserId === "USLACKBOT") {
      return {
        shouldSkip: true,
        matchedRuleId: null,
        reason: "Default exclusion: Slackbot messages",
      };
    }
  }

  return { shouldSkip: false, matchedRuleId: null, reason: null };
}
