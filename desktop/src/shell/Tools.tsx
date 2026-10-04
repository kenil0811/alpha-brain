/**
 * Tools (Intelligence → Tools): voice tools Zazoo runs with the person, the Interviewer built in.
 * A new tool is designed by describing it: Zazoo drafts its name, card line and purpose, the
 * person corrects the words and saves it. A saved tool is a page of the person's wiki under
 * `topic:voice_tools` (title = name, summary = card line, body = what it is for), so there is no
 * new kind of thing in the core; retiring one rewrites its page as retired (the core can't
 * delete a page). Every tool runs on the same interview (./Interview).
 */
import { type ReactElement, useEffect, useState } from "react";
import { Mic } from "lucide-react";
import type { Client, Note } from "../core/client";
import { InfoTip } from "../ui";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Input";
import { OpenRow, OpenTitle } from "./IntelItem";
import { draftToolPrompt, INTERVIEWER, parseToolDraft, type Tool } from "./interviewPlan";

export const TOOLS_SCOPE = "topic:voice_tools";
const RETIRED = "(retired)";

type Form = Omit<Tool, "id">;
const EMPTY: Form = { title: "", description: "", instructions: "" };

const toolsOf = (notes: Note[]): Tool[] =>
  notes.filter((n) => n.scope === TOOLS_SCOPE && n.body.trim() !== RETIRED).map((n) => ({ id: n.id, title: n.title, description: n.summary ?? "", instructions: n.body }));

export function Tools({ client, notes, onOpen, onChanged }: { client: Client; notes: Note[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const tools = toolsOf(notes);
  const [idea, setIdea] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  const fail = (e: unknown) => setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });

  const draft = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const talk = await client.newConversation(null, "Design a tool");
      const turn = await client.askAndWait(draftToolPrompt(idea), { conversation: talk.id });
      const made = turn.state === "done" ? parseToolDraft(turn.reply ?? "") : null;
      if (!made) throw new Error(turn.reply || "Zazoo couldn't draft that tool. Say a little more about it.");
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
    if ([INTERVIEWER, ...tools].some((t) => t.title.toLowerCase() === title.toLowerCase())) {
      setMessage({ ok: false, text: `There is already a tool called ${title}.` });
      return;
    }
    try {
      await client.writeNote(TOOLS_SCOPE, title, form.instructions.trim(), form.description.trim() || title);
      setForm(null);
      setIdea("");
      setMessage({ ok: true, text: `Saved ${title}.` });
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const retire = (t: Tool) => {
    setRetiring(null);
    client.writeNote(TOOLS_SCOPE, t.title, RETIRED, `${t.description} ${RETIRED}`).then(onChanged, fail);
  };

  const row = (t: Tool, builtIn: boolean) => (
    <OpenRow key={t.id} open={() => onOpen(t.id)}>
      <div className="item__ico" aria-hidden="true">
        <Mic size={16} />
      </div>
      <div className="item__body">
        <OpenTitle open={() => onOpen(t.id)}>{t.title}</OpenTitle>
        <div className={`item__sub${retiring === t.id ? " item__sub--warn" : ""}`}>{retiring === t.id ? "It leaves Tools. What its interviews kept stays." : t.description}</div>
      </div>
      {builtIn ? <Badge variant="neutral">Built in</Badge> : null}
      {retiring === t.id ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setRetiring(null)}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" onClick={() => retire(t)}>
            Retire
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={() => setForm({ title: `${t.title} (copy)`, description: t.description, instructions: t.instructions })}>
            Start from this
          </Button>
          {builtIn ? null : (
            <Button variant="ghost" size="sm" onClick={() => setRetiring(t.id)}>
              Retire
            </Button>
          )}
        </>
      )}
    </OpenRow>
  );

  return (
    <div className="stack">
      <div className="section__head section__head--tight">
        <h2>
          Voice tools <InfoTip content="Each reads what Zazoo holds, finds what's missing for its purpose, and asks the most valuable questions first, in the time you give it. Nothing is kept without your yes." label="About voice tools" />
        </h2>
      </div>
      <div className="card list">
        {row(INTERVIEWER, true)}
        {tools.map((t) => row(t, false))}
      </div>

      <div className="section__head section__head--tight">
        <h2>
          Design a tool <InfoTip content="Describe it; Zazoo drafts the name and purpose, you fix the words and save it." label="About designing a tool" />
        </h2>
      </div>
      <div className="card card--pad stack">
        {message ? (
          <p className={message.ok ? "notice notice--ok" : "notice"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        ) : null}
        {form ? (
          <>
            <label className="faint" htmlFor="tool-title">Name</label>
            <Input id="tool-title" className="tools__name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <label className="faint" htmlFor="tool-description">Card line</label>
            <Input id="tool-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <label className="faint" htmlFor="tool-instructions">What it's for</label>
            <Textarea id="tool-instructions" rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            <div className="row">
              <Button onClick={() => void save()} disabled={!form.title.trim() || !form.instructions.trim()}>
                Save tool
              </Button>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <Textarea aria-label="Describe the tool" rows={3} placeholder="A Friday retro: what moved, what slipped, what to drop" value={idea} onChange={(e) => setIdea(e.target.value)} />
            <div className="row">
              <Button onClick={() => void draft()} disabled={busy || !idea.trim()}>
                {busy ? "Drafting…" : "Draft it"}
              </Button>
              <Button variant="ghost" onClick={() => setForm(EMPTY)}>
                Write it myself
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A tool's own page: the built-in Interviewer, or a saved tool by its page's id. */
export function ToolPage({ client, id, children }: { client: Client; id: string; children: (tool: Tool) => ReactElement }) {
  const [tool, setTool] = useState<Tool | null>(id === INTERVIEWER.id ? INTERVIEWER : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id === INTERVIEWER.id) return;
    client.intelligence().then(
      (data) => {
        const found = toolsOf(data.knowledge.notes).find((t) => t.id === id);
        if (found) setTool(found);
        else setError("That tool isn't there any more.");
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [client, id]);
  if (tool) return children(tool);
  return <div className="page">{error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Opening…</p>}</div>;
}
