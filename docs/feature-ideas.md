# Feature Ideas & Brainstorms

A running log of feature concepts, architectural ideas, and strategic thoughts for the Adi Assistant app. These are captured for future reference — not necessarily committed to implementation.

---

## 1. Tiered AI Model Architecture (Cost Optimization)

**Status:** Idea
**Date captured:** 2026-03-23

**Problem:** Running Claude Opus 4.6 (thinking) on every piece of incoming communication will get expensive fast.

**Idea:** Use a cheap, high-performing model (e.g., DeepSeek via AI Gateway) as a first-pass triage layer. Only escalate to Opus 4.6 when deeper analysis is warranted.

**How it would work:**
- The cheap model ingests all incoming communications (Slack messages, etc.)
- It evaluates context and relevance — e.g., an `@channel` FYI from engineering that doesn't require Adi's attention gets filtered out
- Only when the cheap model determines something warrants deeper analysis does it escalate to Opus 4.6 with a refined, context-rich prompt
- Over time, this triage layer improves — learns what matters and what doesn't (think of it as being "fine-tuned" through usage)

**Benefit:** Analyze everything affordably. Reserve expensive inference for moments that actually matter.

---

## 2. Proactive Operational Insight Engine

**Status:** Idea
**Date captured:** 2026-03-23

**Idea:** The system goes beyond triage — it proactively identifies operational improvement opportunities by analyzing communication patterns across channels.

**Example scenario:** The system reads a Slack thread and recognizes a recurring mistake or point of confusion. It identifies that a simple training session, SOP, or process clarification from the Head of CS to their team could prevent this class of error from recurring.

**Key principle:** The system should surface the kinds of insights a skilled VP of RevOps would notice if they had unlimited time to read every message in every channel.

**Types of insights it might surface:**
- Training needs for specific teams
- Process ambiguity causing repeated confusion
- SOP gaps where a simple set of instructions could prevent recurring mistakes
- Cross-team communication breakdowns

---

## 3. Auto-Drafted Asana Tasks with Strategic Reasoning

**Status:** Idea
**Date captured:** 2026-03-23

**Idea:** When the system identifies an actionable insight, it drafts a complete, ready-to-go Asana task — not just a notification or alert.

**Each drafted task includes:**
- **Task name** — clear and actionable
- **Task description** — detailed enough for the assignee to act on
- **Suggested assignee** — the person best positioned to execute
- **Source context** — which conversation/channel/thread triggered this recommendation
- **Reasoning** — why this task is being recommended (the LLM must "defend its reasoning")
- **Strategic justification** — why completing this task would have an outsized positive impact on the company

**UX flow:**
1. Drafted tasks appear in a dedicated review queue in the app
2. Adi reviews each draft with full context and reasoning visible
3. Approve → task gets created in Asana with all details populated
4. Deny → task is discarded (optionally with feedback to improve future recommendations)

**Key principle:** No black-box recommendations. Every suggestion must come with transparent reasoning and strategic justification.
