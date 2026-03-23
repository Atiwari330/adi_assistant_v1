import { anthropic } from "@ai-sdk/anthropic";

/**
 * Get the AI model for action item extraction.
 *
 * Uses Anthropic's Claude via the @ai-sdk/anthropic provider.
 * In production on Vercel, this can be swapped to use the AI Gateway
 * by changing to: gateway("anthropic/claude-sonnet-4-20250514")
 *
 * The model choice balances quality and cost:
 * - Claude Sonnet for day-to-day processing (fast, cost-effective)
 * - Could upgrade to Claude Opus for complex threads if needed
 */
export function getModel() {
  return anthropic("claude-sonnet-4-20250514");
}
