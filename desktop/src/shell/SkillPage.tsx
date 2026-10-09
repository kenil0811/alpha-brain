/**
 * One skill's page: what it is and does, in words; its body shown and never edited here (a
 * skill is Alpha's know-how, repaired by Alpha: the person asks for a change); Alpha's notes
 * page, which the person may edit; its runs. The shared page header carries a back link to
 * Intelligence and the serif title; sections are cards (9 Oct, the UI rulebook §5).
 */
import { useEffect, useState } from "react";
import type { Client, SkillDetail } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, EmptyCard, PageHeader, SectionCard, Trouble } from "../ui";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";

const KIND: Record<string, string> = { read: "Reads a list from a page", act: "Does a task on a site", run: "Runs on its own" };

export function SkillPage({ client, name, version, onGo, onAsk, onChanged }: { client: Client; name: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .skillPage(name)
      .then((s) => {
        if (!live) return;
        setSkill(s);
        setError(null);
        if (!editing) setBody(s.notes?.body ?? "");
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, name, version, tick, editing]);
  const back = <BackLink to="Skills" onClick={() => onGo({ kind: "intelligence", tab: "skills" })} />;
  if (!skill) {
    return (
      <>
        <PageHeader left={back} />
        <div className="page page--column">{error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this skill: {error}</Trouble> : <p className="faint">Loading this skill…</p>}</div>
      </>
    );
  }
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  const saveNotes = () => {
    setProblem(null);
    void client
      .writeNote(`skill:${name}`, name, body, skill.notes?.summary ?? undefined)
      .then(() => {
        setEditing(false);
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
            <span className="faint">
              {skill.name} · version {skill.version}
              {skill.site ? ` · ${skill.site}` : ""}
              {skill.effect ? ` · ${skill.effect === "send" ? "sends, asks every time" : "prepares, stays in your account"}` : ""}
              {skill.last_run_at ? ` · last ${skill.kind === "read" ? `read ${skill.last_count ?? 0} records` : "run"} ${when(skill.last_run_at)}` : ""}
            </span>
          </div>
          {skill.when_to_use ? <p className="muted">When: {skill.when_to_use}</p> : null}
          {skill.last_problem ? <Trouble>{skill.last_problem}</Trouble> : null}

          <SectionCard title="How it works" subtitle="Alpha wrote this and repairs it; it is not edited by hand.">
            {skill.url ? (
              <p className="muted">
                Starts at <a href={skill.url} target="_blank" rel="noreferrer">{skill.url}</a>
              </p>
            ) : null}
            {skill.kind === "read" && skill.script ? <pre className="code" aria-label="The reader's script">{skill.script}</pre> : null}
            {skill.kind !== "read" && skill.steps?.length ? (
              <ol className="steps">
                {skill.steps.map((st, i) => (
                  <li key={i}>{stepSentence(st)}</li>
                ))}
              </ol>
            ) : null}
            {skill.kind === "act" && skill.fields?.length ? <p className="faint">Fields the person's request fills: {skill.fields.join(", ")}</p> : null}
            {skill.kind === "act" && skill.verify?.length ? <p className="faint">Checked afterwards: {skill.verify.map((v) => stepSentence(v)).join("; ")}</p> : null}
          </SectionCard>

          <SectionCard
            title="Alpha's notes"
            subtitle="What it learned about the site; yours to add to"
            actions={
              editing ? (
                <>
                  <Button size="sm" variant="primary" onClick={saveNotes}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBody(skill.notes?.body ?? ""); }}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setEditing(true)}>
                  {skill.notes ? "Edit" : "Write"}
                </Button>
              )
            }
          >
            {problem ? <Trouble>Couldn't save the notes: {problem}</Trouble> : null}
            {editing ? (
              <textarea className="note__edit" rows={8} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Notes on ${name}`} />
            ) : skill.notes ? (
              <div className="people__page">{skill.notes.body}</div>
            ) : (
              <p className="muted">No notes yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Runs" subtitle={skill.runs.length ? undefined : "Nothing in the journal names it yet"}>
            {!skill.runs.length ? <EmptyCard title="No runs yet">Each time it reads or runs, the journal records it and it appears here.</EmptyCard> : null}
            <div className="list">
              {[...skill.runs].reverse().map((r, i) => (
                <div key={`${r.at}-${i}`} className="list__row">
                  <span className="faint people__when">{when(r.at)}</span>
                  <Badge tone={r.kind === "failed" ? "bad" : r.kind === "made" ? "info" : "gray"}>{r.kind}</Badge>
                  <span className="people__line">{r.text}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
