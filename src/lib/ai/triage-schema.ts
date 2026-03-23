import { z } from "zod";

/**
 * Lightweight schema for the triage model's classification output.
 * Designed to be simple and cheap — just classify, don't extract full action items.
 */
export const TriageClassificationSchema = z.object({
  messages: z
    .array(
      z.object({
        sourceMessageIndex: z
          .number()
          .describe("Zero-based index of the source message"),
        classification: z
          .enum(["action_needed", "no_action", "needs_deeper_analysis"])
          .describe(
            "action_needed = clear action item, no_action = skip, needs_deeper_analysis = escalate to advanced model",
          ),
        confidence: z
          .enum(["high", "medium", "low"])
          .describe("How confident are you in this classification?"),
        preliminaryPriority: z
          .enum(["critical", "high", "medium", "low", "info"])
          .describe("Best estimate of priority level"),
        preliminaryActionType: z
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
          .describe("Best estimate of action type"),
        preliminaryTitle: z
          .string()
          .describe(
            "Short action-oriented title (max 120 chars). Required for action_needed, optional for others.",
          ),
        preliminarySummary: z
          .string()
          .describe(
            "2-3 sentence summary. Required for action_needed, optional for others.",
          ),
        escalationReason: z
          .string()
          .nullable()
          .describe(
            "If needs_deeper_analysis, explain why. Null otherwise.",
          ),
        noActionReason: z
          .string()
          .nullable()
          .describe("If no_action, explain why. Null otherwise."),
      }),
    )
    .describe("Classification for each input message"),
});

export type TriageClassification = z.infer<typeof TriageClassificationSchema>;
export type TriageMessageResult = TriageClassification["messages"][number];
