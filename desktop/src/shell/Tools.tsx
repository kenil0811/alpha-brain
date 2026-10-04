/**
 * Tools (Intelligence → Tools): voice tools Alpha runs with the person, the Interviewer built in.
 * A new tool is designed by describing it: Alpha drafts its name, card line and purpose, the
 * person corrects the words and saves it. A saved tool is a page of the person's wiki under
 * `topic:voice_tools` (title = name, summary = card line, body = what it is for), so it is the
 * person's own words, readable in Knowledge, with no new kind of thing in the core; retiring one
 * rewrites its page as retired (the core has no way to delete a page). Every tool runs on the
 * same interview engine (shell/Interview): it reads what Alpha holds, ranks its questions by
 * value for the time given, and keeps nothing without a yes.
 */
import { type ReactElement, useCallback, useEffect, useState } from "react";
import type { Client, Note } from "../core/client";
import { Button, Confirm } from "../ui";
import { Mic } from "../ui/icons";
import { draftToolPrompt, INTERVIEWER, parseToolDraft, type Tool } from "./interviewPlan";
import type { Surface } from "./Rail";

export const TOOLS_SCOPE = "topic:voice_tools";
const RETIRED = "(retired)";

type Form = Omit<Tool, "id">;
const EMPTY: Form = { title: "", description: "", instructions: "" };

const toolOf = (n: Note): Tool => ({ id: n.id, title: n.title, description: n.summary ?? "", instructions: n.body });
const isTool = (n: Note) => n.scope === TOOLS_SCOPE && n.body.trim() !== RETIRED;

async function savedTools(client: Client): Promise<Tool[]> {
  return (await client.intelligence()).knowledge.notes.filter(isTool).map(toolOf);
}

export function Tools({ client, onGo }: { client: Client; onGo: (s: Surface) => void }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [idea, setIdea] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<Tool | null>(null);
  const fail = (e: unknown) => setMessage(e instanceof Error ? e.message : String(e));

  const load = useCallback(() => {
    savedTools(client).then(setTools, fail);
  }, [client]);
  useEffect(load, [load]);

  const draft = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const talk = await client.newConversation(null, "Design a tool");
      const turn = await client.askAndWait(draftToolPrompt(idea), { conversation: talk.id });
      const made = turn.state === "done" ? parseToolDraft(turn.reply ?? "") : null;
      if (!made) throw new Error(turn.reply || "Alpha couldn't draft that tool. Say a little more about it.");
      setForm(made);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form) return;
    const title = form.title.trim();
    // One page per title in a scope: saving under a taken name would replace that tool.
    if (tools.some((t) => t.title.toLowerCase() === title.toLowerCase())) {
      setMessage(`There is already a tool called ${title}. Give this one another name.`);
      return;
    }
    try {
      await client.writeNote(TOOLS_SCOPE, title, form.instructions.trim(), form.description.trim() || title);
      setForm(null);
      setIdea("");
      setMessage(`Saved ${title}.`);
      load();
    } catch (e) {
      fail(e);
    }
  };

  const card = (t: Tool, builtIn: boolean) => (
    <div key={t.id} className="card tools__card">
      <strong>{t.title}</strong>
      <p className="muted">{t.description}</p>
      <div className="row">
        <Button size="sm" variant="primary" icon={<Mic size={14} />} onClick={() => onGo({ kind: "tool", id: t.id })}>
          Open
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setForm({ title: `${t.title} (copy)`, description: t.description, instructions: t.instructions })}>
          Start from this
        </Button>
        {builtIn ? null : (
          <Button size="sm" variant="ghost" onClick={() => setRetiring(t)}>
            Retire
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="stack">
      {message ? <p className="notice">{message}</p> : null}
      <div className="tools__grid">
        {card(INTERVIEWER, true)}
        {tools.map((t) => card(t, false))}
      </div>

      <div className="card tools__card">
        <strong>Design a tool</strong>
        {form ? (
          <>
            <label className="faint" htmlFor="tool-title">Name</label>
            <input id="tool-title" className="need__input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <label className="faint" htmlFor="tool-description">What you read on its card</label>
            <input id="tool-description" className="need__input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <label className="faint" htmlFor="tool-instructions">What it's for: what to find out, what to look for, what should come of it</label>
            <textarea id="tool-instructions" rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            <div className="row">
              <Button variant="primary" onClick={() => void save()} disabled={!form.title.trim() || !form.instructions.trim()}>
                Save tool
              </Button>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <textarea aria-label="Describe the tool" rows={3} placeholder="e.g. A Friday retro: what moved this week, what slipped and why, and what to drop next week." value={idea} onChange={(e) => setIdea(e.target.value)} />
            <div className="row">
              <Button variant="primary" onClick={() => void draft()} disabled={busy || !idea.trim()}>
                {busy ? "Drafting…" : "Draft it"}
              </Button>
              <Button variant="ghost" onClick={() => setForm(EMPTY)}>
                Write it myself
              </Button>
            </div>
          </>
        )}
      </div>

      <Confirm
        open={!!retiring}
        title={`Retire ${retiring?.title ?? ""}?`}
        action="Retire"
        onCancel={() => setRetiring(null)}
        onConfirm={() => {
          const t = retiring;
          setRetiring(null);
          if (t) void client.writeNote(TOOLS_SCOPE, t.title, RETIRED, `${t.description} ${RETIRED}`).then(load, fail);
        }}
      >
        It leaves Tools. What its interviews kept stays.
      </Confirm>
    </div>
  );
}

/** A tool's own page: the built-in Interviewer, or a saved tool by its page's id. */
export function ToolPage({ client, id, children }: { client: Client; id: string; children: (tool: Tool) => ReactElement }) {
  const [tool, setTool] = useState<Tool | null>(id === INTERVIEWER.id ? INTERVIEWER : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id === INTERVIEWER.id) return;
    savedTools(client).then(
      (all) => {
        const found = all.find((t) => t.id === id);
        if (found) setTool(found);
        else setError("That tool isn't there any more.");
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [client, id]);
  if (error) return <div className="page"><p>{error}</p></div>;
  return tool ? children(tool) : <div className="page"><p className="muted">Opening…</p></div>;
}
