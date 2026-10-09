import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/** A way for any kit part to hand the assistant a request (the dropdown's "Add new…"). Null when
 *  no provider is mounted: the part then says the assistant isn't reachable. (9 Oct.) */
export const AssistantContext = createContext<{ say: (text: string) => void } | null>(null);

export function AssistantProvider({ say, children }: { say: (text: string) => void; children: ReactNode }) {
  return <AssistantContext.Provider value={{ say }}>{children}</AssistantContext.Provider>;
}

export const useAssistant = () => useContext(AssistantContext);
