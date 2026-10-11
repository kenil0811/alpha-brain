/**
 * The Assistant page: the conversation at full width, with every conversation Alpha has had
 * (across modules) down the left, so the person is not confined to the side panel (Kenil,
 * 9 Oct 2026). The same Conversation as the panel; a conversation opened here is in the
 * address (#/assistant/<id>). (Merged into the rulebook window, 11 Oct: errors in plain words via
 * `say()`, kit parts, no inline sizes; the side panel stays folded while this page is open.)
 */
import { useEffect, useMemo, useState } from "react";
import { say } from "../core/client";
import type { Client, Convo } from "../core/client";
import { when } from "../modules/format";
import { Button, Notice } from "../ui";
import { CONVO_STATE, Conversation } from "./AssistantPanel";

export function AssistantPage({
  client,
  version,
  onChanged,
  conversationId,
  onOpen,
  draft,
  onDraftTaken,
}: {
  client: Client;
  version: number;
  onChanged: () => void;
  conversationId: string | null;
  onOpen: (id: string) => void;
  draft: { text: string; send: boolean } | null;
  onDraftTaken: () => void;
}) {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .conversations(null, true)
      .then((all) => { setConvos(all); setError(null); })
      .catch((e: unknown) => setError(say(e)));
  }, [client, version]);
  const focus = useMemo(() => (conversationId ? { id: conversationId, at: Date.now() } : null), [conversationId]);
  const chats = convos.filter((c) => c.kind === "chat");
  return (
    <div className="assistpage">
      <aside className="assistpage__list" aria-label="Conversations">
        <div className="assistpage__head">
          <h2>Conversations</h2>
          <Button size="sm" onClick={() => void client.newConversation(null, "New conversation").then((c) => { onOpen(c.id); onChanged(); }).catch((e: unknown) => setError(say(e)))}>
            New
          </Button>
        </div>
        {chats.map((c) => (
          <button key={c.id} type="button" className={`convrow${c.id === conversationId ? " convrow--active" : ""}`} onClick={() => onOpen(c.id)} aria-current={c.id === conversationId ? "true" : undefined}>
            <span className="convrow__body">
              <b>{c.title}</b>
              <span className="faint">
                {c.scope} · {CONVO_STATE[c.state] ?? c.state} · {when(c.last_at)}
              </span>
              {c.last ? <span className="faint convrow__last">{c.last}</span> : null}
            </span>
          </button>
        ))}
        {!chats.length && !error ? <p className="faint assistpage__empty">No conversations yet. Say something on the right.</p> : null}
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </aside>
      <Conversation layout="page" client={client} scopeName="Assistant" module={null} version={version} onChanged={onChanged} draft={draft} onDraftTaken={onDraftTaken} focusConversation={focus} />
    </div>
  );
}
