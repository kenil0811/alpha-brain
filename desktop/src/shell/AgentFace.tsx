/**
 * An agent's face (13 Oct, Q42 section 7c; the feature from pull request #5, drawn with main's
 * companion artwork): Alpha wears the companion's look (Settings); each automation wears the look
 * picked on its page (`agent_looks`, `{ automation id: look }`), else Alpha's. Small, in a round
 * frame, at the start of its row in Intelligence › Agents.
 */
import type { Client } from "../core/client";
import { usePreference } from "../core/preferences";
import { normaliseLook, type Look } from "../avatar/looks";
import { Rig } from "../avatar/Rig";

export const ALPHA_AGENT = "alpha";
const NO_LOOKS: Record<string, unknown> = {};

/** The look agent `id` wears, and a setter that keeps a new one for it (none for Alpha, whose
 *  look is the companion's, set in Settings). */
export function useAgentLook(client: Client | null, id: string): [Look, ((look: Look) => Promise<string | null>) | null, boolean] {
  const [looks, setLooks] = usePreference<Record<string, unknown>>(client, "agent_looks", NO_LOOKS);
  const [companion] = usePreference<unknown>(client, "companion_look", null);
  const own = id !== ALPHA_AGENT && looks && typeof looks === "object" ? looks[id] : undefined;
  const set = id === ALPHA_AGENT ? null : (look: Look) => setLooks({ ...(looks ?? {}), [id]: look });
  return [normaliseLook(own ?? companion), set, Boolean(own)];
}

export function AgentFace({ client, id, size = 26, label }: { client: Client | null; id: string; size?: number; label: string }) {
  const [look] = useAgentLook(client, id);
  return (
    <span className="agentface" style={{ width: size + 4, height: size + 4 }} role="img" aria-label={label}>
      <Rig look={look} mood="idle" size={size} />
    </span>
  );
}
