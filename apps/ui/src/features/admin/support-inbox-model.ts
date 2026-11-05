export type SupportStatus = "open" | "waiting" | "resolved";
export type SupportSource = "email" | "google-beta";
export type BetaStatus = "pending" | "approved" | "declined";
export type SupportThread = {
  id: string;
  sender_email: string;
  subject: string;
  status: SupportStatus;
  last_message_at: string;
  source: SupportSource;
  beta_status: BetaStatus | null;
  last_direction: "inbound" | "outbound" | null;
  last_delivery_status: string | null;
};
export type SupportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  source: "email" | "application" | "reply";
  from: string;
  to: string;
  subject: string;
  body: string;
  deliveryStatus: string;
  createdAt: string;
};
export type SupportDetail = {
  thread: SupportThread;
  messages: SupportMessage[];
  beta?: {
    googleEmail: string;
    providers: string[];
    status: BetaStatus;
    reviewedAt: string | null;
  };
};
export const GOOGLE_BETA_APP_NAMES: Record<string, string> = {
  gmail: "Gmail",
  google_drive: "Google Drive",
  google_docs: "Google Docs",
  google_sheets: "Google Sheets",
  google_calendar: "Google Calendar",
};
export function betaReplyDraft(detail: SupportDetail) {
  return (
    "Hi,\n\nYour Remote Arc Google Apps Beta access is now open.\n\nSign in to Remote Arc with " +
    detail.thread.sender_email +
    " and open Connected Apps:\nhttps://agent.remotearc.app/dashboard/connect/apps\n\nConnect the Google account we approved: " +
    detail.beta!.googleEmail +
    ".\n\nWhile the integration is in testing, Google authorization may expire after seven days. Reconnect if prompted.\n\nIf you run into a problem, reply to this email and we will help.\n\nThe Remote Arc team"
  );
}
