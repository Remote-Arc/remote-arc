// How each AI client with a setup guide names itself when it registers with
// Relay's OAuth. Client names are chosen by whoever registers the client, so
// these only recognise a known client; anything else stays unnamed.
export const AI_CLIENT_NAME_MATCH = {
  chatgpt: /chatgpt|openai/i,
  claude: /claude|anthropic/i,
  gemini: /gemini/i,
  cursor: /cursor/i,
} as const;

export type KnownAiClient = keyof typeof AI_CLIENT_NAME_MATCH;

/** Whether an OAuth client name is the given AI client. */
export const isAiClientName = (client: KnownAiClient, name: string) =>
  AI_CLIENT_NAME_MATCH[client].test(name);
