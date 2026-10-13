/**
 * The Assistant page: the conversation at full width, with every conversation Alpha has had
 * (across modules) down the left, so the person is not confined to the side panel (Kenil,
 * 9 Oct 2026). The same Conversation as the panel; a conversation opened here is in the
 * address (#/assistant/<id>). A right-click on one renames or deletes it (13 Oct, slice 2 G1, C9).
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import type { Client, Convo } from "../core/client";
import { when } from "../modules/format";
import { Button } from "../ui";
import { Conversation } from "./AssistantPanel";
import { RenameBox, useConversationActions } from "./ConversationActions";
import { say } from "../core/client";

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
  // right-click a conversation: Rename… and Delete… (slice 2 G1, C9)
  const [menuAt, setMenuAt] = useState<{ convo: Convo; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const actions = useConversationActions(client, (what, id) => {
    setTick((t) => t + 1);
    onChanged();
    if (what === "deleted" && id === conversationId) {
      const next = convos.find((c) => c.kind === "chat" && c.id !== id);
      if (next) onOpen(next.id);
    }
  });
  useEffect(() => {
    client
      .conversations(null, true)
      .then((all) => { setConvos(all); setError(null); })
      .catch((e: unknown) => setError(say(e)));
  }, [client, version, tick]);
  const focus = useMemo(() => (conversationId ? { id: conversationId, at: Date.now() } : null), [conversationId]);
  const chats = convos.filter((c) => c.kind === "chat");
  return (
    <div className="assistpage">
      <aside className="assistpage__list" aria-label="Conversations">
        <div className="assistpage__head">
          <h2>Conversations</h2>
          <Button size="sm" onClick={() => void client.newConversation(null, "New conversation").then((c) => { onOpen(c.id); onChanged(); }).catch(() => undefined)}>
            New
          </Button>
        </div>
        {chats.map((c) => renaming === c.id ? (
          <div key={c.id} className="convrow convrow--renaming">
            <RenameBox convo={c} onSave={(t) => { setRenaming(null); void actions.rename(c, t); }} onCancel={() => setRenaming(null)} />
          </div>
        ) : (
          <button key={c.id} type="button" className={`convrow${c.id === conversationId ? " convrow--active" : ""}`} onClick={() => onOpen(c.id)} onContextMenu={(e) => { e.preventDefault(); setMenuAt({ convo: c, x: e.clientX, y: e.clientY }); }} aria-current={c.id === conversationId ? "true" : undefined}>
            <span className={`convchip__dot convchip__dot--${c.state}`} aria-hidden="true" />
            <span className="convrow__body">
              <b>{c.title}</b>
              <span className="faint">
                {c.scope} · {when(c.last_at)}
              </span>
              {c.last ? <span className="faint convrow__last">{c.last}</span> : null}
            </span>
          </button>
        ))}
        {!chats.length && !error ? <p className="faint" style={{ padding: "4px 10px" }}>No conversations yet. Say something on the right.</p> : null}
        {error ? <p className="notice">{error}</p> : null}
        {actions.problem ? <p className="notice" role="alert">{actions.problem}</p> : null}
        <DropdownMenu.Root open={menuAt !== null} onOpenChange={(o) => !o && setMenuAt(null)} modal={false}>
          <DropdownMenu.Trigger asChild>
            <span className="ctxanchor" style={{ left: menuAt?.x ?? 0, top: menuAt?.y ?? 0 }} aria-hidden="true" tabIndex={-1} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu__list popover" align="start" sideOffset={2} collisionPadding={8} aria-label={menuAt ? `${menuAt.convo.title}: menu` : undefined}>
              {menuAt ? (
                <>
                  <DropdownMenu.Item className="menu__item" onSelect={() => setRenaming(menuAt.convo.id)}>
                    Rename…
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu__item menu__item--danger" onSelect={() => actions.askDelete(menuAt.convo)}>
                    Delete…
                  </DropdownMenu.Item>
                </>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {actions.confirm}
      </aside>
      <Conversation layout="page" client={client} scopeName="Assistant" module={null} version={version} onChanged={onChanged} draft={draft} onDraftTaken={onDraftTaken} focusConversation={focus} />
    </div>
  );
}
