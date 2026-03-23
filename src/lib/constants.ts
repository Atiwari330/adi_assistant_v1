/** How many minutes between background sync polls */
export const SYNC_INTERVAL_MINUTES = 5;

/** Minimum seconds between manual sync triggers */
export const MANUAL_SYNC_COOLDOWN_SECONDS = 30;

/** Max characters of message body to send to the LLM */
export const MAX_BODY_LENGTH_FOR_LLM = 4000;

/** Max messages from a thread to include in LLM context */
export const MAX_THREAD_MESSAGES_FOR_LLM = 5;

/** Max standalone messages to batch in a single LLM call */
export const MAX_BATCH_SIZE_FOR_LLM = 10;

/** Default page size for paginated API responses */
export const DEFAULT_PAGE_SIZE = 20;

/** How many days back to look on first sync (no cursor yet) */
export const INITIAL_SYNC_LOOKBACK_DAYS = 7;

/** Email patterns to always exclude (checked before user rules) */
export const DEFAULT_EXCLUDED_SENDERS = [
  "noreply@",
  "no-reply@",
  "notifications@",
  "mailer-daemon@",
  "postmaster@",
] as const;

/** Gmail API scopes required for the integration */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

/** Slack bot token scopes required for the integration */
export const SLACK_REQUIRED_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "users:read",
  "users:read.email",
] as const;
