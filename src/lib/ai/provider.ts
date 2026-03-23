import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { TRIAGE_MODEL, ANALYSIS_MODEL } from "@/lib/constants";

/**
 * Cheap triage model for message classification.
 * Uses DeepSeek V3.2 via Vercel AI Gateway (~10-35x cheaper than Claude Sonnet).
 */
export function getTriageModel() {
  return gateway(TRIAGE_MODEL);
}

/**
 * Full analysis model for deep action item extraction.
 * Uses Claude Sonnet 4 for nuanced reasoning, delegation, and complex threads.
 */
export function getAnalysisModel() {
  return anthropic(ANALYSIS_MODEL);
}

/** @deprecated Use getAnalysisModel() instead */
export function getModel() {
  return getAnalysisModel();
}
