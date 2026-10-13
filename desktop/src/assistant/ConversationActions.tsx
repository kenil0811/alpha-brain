/**
 * A conversation renamed and deleted (13 Oct, slice 2 G1, C9), the same from the panel's picker
 * and the Assistant page's list: a title edited in place (Enter saves, Escape cancels), and a
 * delete that asks first with what it does. What Alpha learned from it stays; Activity keeps its
 * turns, marked as from a removed conversation.
 */
import { useState } from "react";
import { say, type Client, type Convo } from "../core/client";
import { Confirm } from "../ui";

export function RenameBox({ convo, onSave, onCancel }: { convo: Pick<Convo, "title">; onSave: (title: string) => void; onCancel: () => void }) {
  return (
    <input
      className="textfield convrename"
      aria-label={`New title for ${convo.title}`}
      defaultValue={convo.title}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(e.currentTarget.value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => onSave(e.currentTarget.value)}
    />
  );
}

/** Rename and delete, with the delete's confirm to render; `onDone` after either. */
export function useConversationActions(client: Client, onDone: (what: "renamed" | "deleted", id: string) => void) {
  const [deleting, setDeleting] = useState<{ convo: Pick<Convo, "id" | "title">; what: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const rename = async (convo: Pick<Convo, "id" | "title">, title: string) => {
    if (title.trim() === convo.title) return;
    setProblem(null);
    try {
      await client.renameConversation(convo.id, title);
      onDone("renamed", convo.id);
    } catch (e) {
      setProblem(`Couldn't rename it: ${say(e)}`);
    }
  };
  const askDelete = (convo: Pick<Convo, "id" | "title">) => {
    setProblem(null);
    client
      .conversationRemoval(convo.id)
      .then((plan) => setDeleting({ convo, what: plan.what }))
      .catch((e: unknown) => setProblem(`Couldn't delete it: ${say(e)}`));
  };
  const confirm = (
    <Confirm
      open={deleting !== null}
      title={deleting ? `Delete "${deleting.convo.title}"?` : ""}
      action="Delete"
      onConfirm={() => {
        const d = deleting;
        setDeleting(null);
        if (d) client.deleteConversation(d.convo.id).then(() => onDone("deleted", d.convo.id)).catch((e: unknown) => setProblem(`Couldn't delete it: ${say(e)}`));
      }}
      onCancel={() => setDeleting(null)}
    >
      {deleting ? `Deletes it from your lists: ${deleting.what}. Activity keeps its turns, marked as from a removed conversation.` : null}
    </Confirm>
  );
  return { rename, askDelete, confirm, problem };
}
