import { google } from "googleapis";
import { GMAIL_SCOPES } from "@/lib/constants";

/**
 * Create a Google OAuth2 client configured with app credentials.
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`,
  );
}

/**
 * Generate the Google OAuth consent URL.
 */
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline", // get refresh_token
    prompt: "consent", // always show consent to ensure refresh_token
    scope: [...GMAIL_SCOPES],
    state,
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Refresh an expired access token using a refresh token.
 * Returns the new tokens (access_token will be updated, refresh_token may be null).
 */
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

/**
 * Revoke a token (access or refresh) with Google.
 */
export async function revokeToken(token: string) {
  const oauth2Client = createOAuth2Client();
  await oauth2Client.revokeToken(token);
}

/**
 * Create an authenticated Gmail API client from stored tokens.
 * Handles automatic token refresh if the access token is expired.
 */
export function createGmailClient(accessToken: string, refreshToken: string) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return {
    gmail: google.gmail({ version: "v1", auth: oauth2Client }),
    oauth2Client,
  };
}
