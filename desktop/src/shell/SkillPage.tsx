/**
 * One skill's page: everything about it as fields the person can edit (name, description, when
 * to use it, its instructions), Alpha's notes on it, and its runs. The core has no call that
 * edits a skill, so Save stays disabled with the reason; the notes save (`writeNote`). The
 * shared page header carries a back link to Skills and the serif title (9 Oct, §5).
 */
import { useEffect, useId, useState } from "react";
import type { Client, SkillDetail } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, PageHeader, SectionCard, Trouble } from "../ui";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";

const KIND: Record<string, string> = { read: "Reads a list from a page", act: "Does a task on a site", run: "Runs on its own" };

/** A labelled field: a line, or a box for longer text. Shared by the agent, skill and automation pages. */
export function Field({ label, value, onChange, rows, mono }: { label: string; value: string; onChange: (v: string) => void; rows?: number; mono?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {rows ? <textarea id={id} className={mono ? "intel__code" : undefined} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /> : <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

/** A skill's instructions as one text: a reader's script, else its steps, one per line. */
function instructionsOf(s: SkillDetail): string {
  if (s.kind === "read" && s.script) return s.script;
  return (s.steps ?? []).map((st, i) => `${i + 1}. ${stepSentence(st)}`).join("\n");
}

export function SkillPage({ client, name, version, onGo, onAsk, onChanged }: { client: Client; name: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<Record<"name" | "description" | "when" | "url" | "instructions" | "fields" | "checks", string> | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .skillPage(name)
      .then((s) => {
        if (!live) return;
        setSkill(s);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, name, version, tick]);
  const back = <BackLink to="Skills" onClick={() => onGo({ kind: "intelligence", tab: "skills" })} />;
  if (!skill) {
    return (
      <>
        <PageHeader left={back} />
        <div className="page page--column">{error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this skill: {error}</Trouble> : <p className="faint">Loading the {name} skill…</p>}</div>
      </>
    );
  }
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  const fields = draft ?? { name: skill.name, description: skill.description, when: skill.when_to_use ?? "", url: skill.url ?? "", instructions: instructionsOf(skill), fields: (skill.fields ?? []).join(", "), checks: (skill.verify ?? []).map((v) => stepSentence(v)).join("\n") };
  const edit = (patch: Partial<typeof fields>) => setDraft({ ...fields, ...patch });
  const noteText = notes ?? skill.notes?.body ?? "";
  const saveNotes = () => {
    setProblem(null);
    void client
      .writeNote(`skill:${name}`, name, noteText, skill.notes?.summary ?? undefined)
      .then(() => {
        setNotes(null);
        onChanged();
      })
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
  };
  return (
    <>
      <PageHeader
        left={back}
        title={skill.description}
        right={
          <Button variant="primary" size="sm" onClick={() => onAsk(`Change the skill ${skill.name} (${skill.description}): `)}>
            Ask Alpha to change this
          </Button>
        }
      />
      <div className="page page--column">
        <div className="stack stack--wide">
          <div className="row">
            <Badge tone="info">{KIND[skill.kind] ?? skill.kind}</Badge>
            <Badge tone={skill.health === "ok" ? "good" : skill.health === "broken" ? "bad" : "gray"}>{health}</Badge>
            {skill.effect ? <Badge tone={skill.effect === "send" ? "warn" : "gray"}>{skill.effect === "send" ? "Sends; asks every time" : "Prepares only"}</Badge> : null}
            <span className="faint">
              version {skill.version}
              {skill.site ? ` · ${skill.site}` : ""}
              {skill.last_run_at ? ` · ${when(skill.last_run_at)}` : ""}
            </span>
          </div>
          {skill.last_problem ? <Trouble>{skill.last_problem}</Trouble> : null}

          <SectionCard
            title="Skill"
            actions={
              <>
                {draft ? (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Discard
                  </Button>
                ) : null}
                <Button size="sm" variant="primary" disabledReason="Editing a skill needs Alpha's core">
                  Save
                </Button>
              </>
            }
          >
            <div className="intel__fields">
              <Field label="Name" value={fields.name} onChange={(v) => edit({ name: v })} />
              <Field label="Description" value={fields.description} onChange={(v) => edit({ description: v })} />
              <Field label="When to use" value={fields.when} onChange={(v) => edit({ when: v })} />
              {skill.kind !== "run" ? <Field label="Starts at" value={fields.url} onChange={(v) => edit({ url: v })} /> : null}
              <Field label="Instructions" value={fields.instructions} onChange={(v) => edit({ instructions: v })} rows={10} mono={skill.kind === "read"} />
              {skill.kind === "act" ? <Field label="Fields your request fills" value={fields.fields} onChange={(v) => edit({ fields: v })} /> : null}
              {skill.kind === "act" ? <Field label="Checked afterwards" value={fields.checks} onChange={(v) => edit({ checks: v })} rows={3} /> : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Alpha's notes"
            actions={
              notes !== null ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setNotes(null)}>
                    Discard
                  </Button>
                  <Button size="sm" variant="primary" onClick={saveNotes}>
                    Save
                  </Button>
                </>
              ) : null
            }
          >
            {problem ? <Trouble>Couldn't save the notes: {problem}</Trouble> : null}
            <textarea className="note__edit" rows={6} value={noteText} onChange={(e) => setNotes(e.target.value)} aria-label={`Notes on ${name}`} />
          </SectionCard>

          <SectionCard title="Runs">
            {skill.runs.length ? (
              <div className="list">
                {[...skill.runs].reverse().map((r, i) => (
                  <div key={`${r.at}-${i}`} className="list__row">
                    <span className="faint people__when">{when(r.at)}</span>
                    <Badge tone={r.kind === "failed" ? "bad" : r.kind === "made" ? "info" : "gray"}>{r.kind}</Badge>
                    <span className="people__line">{r.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint">None yet.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
