/**
 * An agent's face: the companion look chosen for that agent (Intelligence › Agents), else the
 * companion's own. Alpha's avatar in the panel and every agent row use this, so the companion
 * picked for an agent is its icon everywhere.
 */
import type { Client } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { normaliseLook } from "../avatar/looks";
import { Rig } from "../avatar/Rig";

export function AgentAvatar({ client, agent = "alpha", size = 28, label }: { client: Client | null; agent?: string; size?: number; label?: string }) {
  const [looks] = usePreference<Record<string, unknown>>(client, PREF.agentLooks, {});
  const [companion] = usePreference<unknown>(client, PREF.companionLook, null);
  const look = normaliseLook(looks[agent] ?? companion);
  return (
    <span className="agent-avatar" style={{ width: size, height: size }} role="img" aria-label={label ?? agent}>
      <Rig look={{ ...look, size: "small" }} mood="idle" size={Math.round(size * 1.5)} />
    </span>
  );
}
