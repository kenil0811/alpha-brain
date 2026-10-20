/**
 * The Assistant page: the stream at full width and height (section C, 20 Oct 2026, Q107), so
 * the person is not confined to the side panel (Kenil, 9 Oct 2026). The same Conversation as
 * the panel. The work items down the left by state are gone with the items themselves: work
 * runs beside the desk and shows in the stream; an address that names a piece of work
 * (#/assistant/<id>) opens the stream narrowed to it.
 */
import { useMemo } from "react";
import type { Client } from "../core/client";
import { Conversation } from "./AssistantPanel";

export function AssistantPage({
  client,
  version,
  onChanged,
  conversationId,
  draft,
  onDraftTaken,
}: {
  client: Client;
  version: number;
  onChanged: () => void;
  conversationId: string | null;
  onOpen?: (id: string) => void;
  draft: { text: string; send: boolean } | null;
  onDraftTaken: () => void;
}) {
  const focus = useMemo(() => (conversationId ? { id: conversationId, at: Date.now() } : null), [conversationId]);
  return (
    <div className="assistpage assistpage--stream">
      <Conversation layout="page" client={client} scopeName="Everything, in one place" module={null} version={version} onChanged={onChanged} draft={draft} onDraftTaken={onDraftTaken} focusConversation={focus} />
    </div>
  );
}
