/**
 * A build or an agent's thread as one compact row where it began in the conversation (visual
 * 8 of the conversation proposal, slice 2): the title, its state, the live step in words while
 * it works, and "open". Not a block pinned above the conversation.
 */
import type { Thread } from "../core/client";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };

export function ThreadRow({ thread, onOpen }: { thread: Thread; onOpen: () => void }) {
  const last = thread.steps?.length ? thread.steps[thread.steps.length - 1] : null;
  const live = thread.state === "working" ? (thread.live?.doing ?? (last ? `${last.kind === "failed" ? "✗" : "✓"} ${last.text}` : null)) : thread.state === "waiting" ? "Waiting for your answer" : null;
  return (
    <button type="button" className="threadrow" onClick={onOpen} aria-label={`${thread.title}: open the thread`}>
      <span className="threadrow__title">{thread.title}</span>
      <span className={`badge badge--${thread.state === "waiting" ? "waiting" : thread.state === "working" ? "running" : "good"}`}>{THREAD_STATE[thread.state] ?? thread.state}</span>
      {live ? <span className="threadrow__live">{live}</span> : null}
      <span className="threadrow__open">open</span>
    </button>
  );
}
