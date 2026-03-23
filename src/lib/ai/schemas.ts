import { z } from "zod";

/**
 * Schema for the LLM's structured output when analyzing messages.
 * Used with Vercel AI SDK's generateObject() for type-safe responses.
 */
export const ActionItemExtractionSchema = z.object({
  items: z
    .array(
      z.object({
        title: z
          .string()
          .describe("Concise one-line summary of the action needed (max 120 chars)"),
        summary: z
          .string()
          .describe(
            "2-3 sentence explanation of what happened and what needs to be done",
          ),
        actionType: z
          .enum([
            "respond",
            "delegate",
            "approve",
            "reject",
            "review",
            "follow_up",
            "schedule",
            "archive",
            "info_only",
          ])
          .describe("The primary action the user should take"),
        priority: z
          .enum(["critical", "high", "medium", "low", "info"])
          .describe(
            "Urgency level. critical=needs immediate attention, high=today, medium=this week, low=when possible, info=FYI only",
          ),
        reasoning: z
          .string()
          .describe(
            "Brief explanation of why this action type and priority were chosen",
          ),
        suggestedDelegateTo: z
          .string()
          .nullable()
          .describe(
            "If action is 'delegate', who should it be delegated to (name or role). Null if not applicable.",
          ),
        delegateReason: z
          .string()
          .nullable()
          .describe(
            "If delegating, why this person/role is the right choice. Null if not applicable.",
          ),
        sourceMessageIndex: z
          .number()
          .describe("Zero-based index of the source message that triggered this action item"),
      }),
    )
    .describe("Action items that require user attention or action"),

  noActionNeeded: z
    .array(
      z.object({
        sourceMessageIndex: z
          .number()
          .describe("Zero-based index of the source message"),
        reason: z
          .string()
          .describe("Why this message does not require any action"),
      }),
    )
    .describe("Messages that are purely informational or don't need a response"),
});

export type ActionItemExtraction = z.infer<typeof ActionItemExtractionSchema>;
export type ExtractedActionItem = ActionItemExtraction["items"][number];
