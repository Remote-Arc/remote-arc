/** The AI clients the site supports, in the order the install guides list them. */
export const aiClients = [
  { name: "ChatGPT", slug: "chatgpt", icon: "/ai-openai.svg", tone: "mono" },
  { name: "Claude", slug: "claude", icon: "/ai-claude.svg", tone: "color" },
  { name: "Gemini", slug: "gemini", icon: "/ai-gemini-four-color-2025.svg", tone: "color" },
  { name: "Cursor", slug: "cursor", icon: "/ai-cursor.svg", tone: "color" },
] as const;
// The homepage topology uses the same supported-client list as the install guides.
export const topologyAiClients = aiClients;
