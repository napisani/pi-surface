export interface ThreadMessage {
  role: "user" | "agent";
  text: string;
  at: string;
}

/** True when the user spoke last, so the agent owes an answer. */
export const awaitingAgent = (messages: readonly ThreadMessage[]) => messages[messages.length - 1]?.role === "user";
