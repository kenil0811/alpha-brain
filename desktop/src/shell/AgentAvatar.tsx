/**
 * An agent's face: the companion look chosen for that agent (on its page), else the companion's
 * own. Every agent row, card, page header and the Second Brain's agent nodes use this, so the
 * companion picked for an agent is its icon everywhere. Small sizes show the head only, framed
 * in a circle: the whole character at 24px is a smudge.
 */
import type { Client } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { normaliseLook, type Look } from "../avatar/looks";
import { Rig } from "../avatar/Rig";

/** The head, in the rig's own units: a square around the face, from the ears to the chin. The
 *  rig draws a 2700 × 2250 view whose top left is (420, 180). */
const HEAD = { x: 918, y: 210, side: 1700 };
const VIEW = { x: 420, y: 180, h: 2250, ratio: 2700 / 2250 };

export function useAgentLook(client: Client | null, agent: string): [Look, (look: Look) => Promise<string | null>] {
  const [looks, setLooks] = usePreference<Record<string, unknown>>(client, PREF.agentLooks, {});
  const [companion] = usePreference<unknown>(client, PREF.companionLook, null);
  return [normaliseLook(looks[agent] ?? companion), (look) => setLooks({ ...looks, [agent]: look })];
}

export function AgentAvatar({ client, agent = "alpha", size = 28, label }: { client: Client | null; agent?: string; size?: number; label?: string }) {
  const [look] = useAgentLook(client, agent);
  const scale = size / HEAD.side;
  const height = VIEW.h * scale;
  // Other parts' icon rules size any svg inside them; the rig's own size is set again here.
  const box = { left: -(HEAD.x - VIEW.x) * scale, top: -(HEAD.y - VIEW.y) * scale, "--rig-w": `${height * VIEW.ratio}px`, "--rig-h": `${height}px` } as React.CSSProperties;
  return (
    <span className="agentface" style={{ width: size, height: size }} role="img" aria-label={label ?? agent}>
      <span className="agentface__rig" style={box} aria-hidden="true">
        <Rig look={look} mood="idle" size={Math.round(height)} />
      </span>
    </span>
  );
}
