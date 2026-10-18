/**
 * The Assistant page: Home, the one conversation, at full width, with the work items down the
 * left by state (Needs you · Working · Done today · Earlier; harness §7, 18 Oct 2026), so the
 * person is not confined to the side panel (Kenil, 9 Oct 2026). The same Conversation as the
 * panel; an item opened here is in the address (#/assistant/<id>) and has its own box. A
 * right-click on an item renames or deletes it (13 Oct, slice 2 G1, C9).
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import type { Client, Convo } from "../core/client";
import { when } from "../modules/format";
import { Button } from "../ui";
import { CONVO_STATE, Conversation } from "./AssistantPanel";
import { RenameBox, useConversationActions } from "./ConversationActions";
import { say } from "../core/client";

/** The lanes of Home (harness §7): Needs you · Working · Done today · Earlier (everything
 *  else: done or stopped before today, and items merely open between turns), newest first. */
export function laneItems(items: Convo[], now = new Date()): [string, Convo[]][] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lanes: Record<string, Convo[]> = { "Needs you": [], Working: [], "Done today": [], Earlier: [] };
  items.forEach((c) => {
    const over = c.state === "done" || c.state === "stopped";
    const lane = c.state === "needs_you" ? "Needs you" : c.state === "working" ? "Working" : over && new Date(c.updated_at).getTime() >= midnight ? "Done today" : "Earlier";
    lanes[lane].push(c);
  });
  return Object.entries(lanes).filter(([, rows]) => rows.length);
}

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
      // the open item went: Home, or the next item when Home is not in the list
      const next = convos.find((c) => c.kind === "home") ?? convos.find((c) => c.kind === "work" && c.id !== id);
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
  const home = convos.find((c) => c.kind === "home") ?? null;
  const lanes = laneItems(convos.filter((c) => c.kind === "work"));
  const current = conversationId ?? home?.id ?? null;
  return (
    <div className="assistpage">
      <aside className="assistpage__list" aria-label="Conversations">
        <div className="assistpage__head">
          <h2>Work</h2>
          <Button size="sm" title="A new work item; its first sentence names it" onClick={() => void client.newConversation(null, "New conversation").then((c) => { onOpen(c.id); onChanged(); }).catch(() => undefined)}>
            New
          </Button>
        </div>
        {home ? (
          <button type="button" className={`convrow${home.id === current ? " convrow--active" : ""}`} onClick={() => onOpen(home.id)} aria-current={home.id === current ? "true" : undefined}>
            <span className="convrow__body">
              <b>Home</b>
              <span className="faint">The one conversation · {home.last_at ? when(home.last_at) : "nothing said yet"}</span>
            </span>
          </button>
        ) : null}
        {lanes.map(([lane, rows]) => (
          <section key={lane} aria-label={lane}>
            <div className="lane__head" style={{ padding: "10px 10px 2px" }}>{lane}</div>
            {rows.map((c) => renaming === c.id ? (
              <div key={c.id} className="convrow convrow--renaming">
                <RenameBox convo={c} onSave={(t) => { setRenaming(null); void actions.rename(c, t); }} onCancel={() => setRenaming(null)} />
              </div>
            ) : (
              <button key={c.id} type="button" className={`convrow${c.id === current ? " convrow--active" : ""}`} onClick={() => onOpen(c.id)} onContextMenu={(e) => { e.preventDefault(); setMenuAt({ convo: c, x: e.clientX, y: e.clientY }); }} aria-current={c.id === current ? "true" : undefined}>
                <span className={`convchip__dot convchip__dot--${c.state}`} aria-hidden="true" />
                <span className="convrow__body">
                  <b>{c.title}</b>
                  <span className="faint">
                    {CONVO_STATE[c.state] ?? c.state} · {when(c.last_at)}
                  </span>
                  {c.last_line ? <span className="faint convrow__last oneline">{c.last_line}</span> : null}
                </span>
              </button>
            ))}
          </section>
        ))}
        {!lanes.length && !error ? <p className="faint" style={{ padding: "4px 10px" }}>No work yet. Say what to do on the right; work that stands gets an item here.</p> : null}
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
