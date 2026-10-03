/**
 * One skill's page: what it is and does, in words; its body shown and never edited here (a
 * skill is Alpha's know-how, repaired by Alpha: the person asks for a change); Alpha's notes
 * page, which the person may edit; its runs.
 */
import { useEffect, useState } from "react";
import type { Client, SkillDetail } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button } from "../ui";
import { ArrowLeft } from "../ui/icons";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";

const KIND: Record<string, string> = { read: "Reads a list from a page", act: "Does a task on a site", run: "Runs on its own" };

export function SkillPage({ client, name, version, onGo, onAsk, onChanged }: { client: Client; name: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
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
  }, [client, name, version, editing]);
  if (error) return <div className="page"><p className="notice" role="alert">{error}</p></div>;
  if (!skill) return <div className="page"><p className="empty">Loading…</p></div>;
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  const saveNotes = () =>
    void client.writeNote(`skill:${name}`, name, body, skill.notes?.summary ?? undefined).then(() => {
      setEditing(false);
      onChanged();
    });
  return (
    <div className="page">
      <Button size="sm" onClick={() => onGo({ kind: "intelligence", tab: "skills" })}>
        <ArrowLeft size={14} aria-hidden="true" /> Skills
      </Button>
      <div className="modhead" style={{ marginTop: 12 }}>
        <div className="modhead__title" style={{ display: "block" }}>
          <h1>{skill.description}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <Badge tone="info">{KIND[skill.kind] ?? skill.kind}</Badge>
            <Badge tone={skill.health === "ok" ? "good" : skill.health === "broken" ? "bad" : "gray"}>{health}</Badge>
            <span className="faint">
              {skill.name} · version {skill.version}
              {skill.site ? ` · ${skill.site}` : ""}
              {skill.effect ? ` · ${skill.effect === "send" ? "sends, asks every time" : "prepares, stays in your account"}` : ""}
              {skill.last_run_at ? ` · last ${skill.kind === "read" ? `read ${skill.last_count ?? 0} rows` : "run"} ${when(skill.last_run_at)}` : ""}
            </span>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => onAsk(`Change the skill ${skill.name} (${skill.description}): `)}>
          Ask Alpha to change this
        </Button>
      </div>
      {skill.when_to_use ? <p className="muted">When: {skill.when_to_use}</p> : null}
      {skill.last_problem ? <p className="notice">{skill.last_problem}</p> : null}

      <div className="section">
        <div className="section__head">
          <h2>How it works</h2>
          <span className="faint">Alpha wrote this and repairs it; it is not edited by hand.</span>
        </div>
        <div className="card card--pad">
          {skill.url ? (
            <p className="muted" style={{ marginBottom: 8 }}>
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
          {skill.kind === "act" && skill.verify?.length ? (
            <p className="faint">Checked afterwards: {skill.verify.map((v) => stepSentence(v)).join("; ")}</p>
          ) : null}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Alpha's notes</h2>
          <span className="faint">what it learned about the site; yours to add to</span>
          <span className="section__right">
            {editing ? (
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
            )}
          </span>
        </div>
        <div className="card card--pad">
          {editing ? (
            <textarea className="note__edit" rows={8} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Notes on ${name}`} />
          ) : skill.notes ? (
            <div className="people__page">{skill.notes.body}</div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>No notes yet.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Runs</h2>
        </div>
        {!skill.runs.length ? <p className="empty">Nothing in the journal names it yet.</p> : null}
        <div className="card list">
          {[...skill.runs].reverse().map((r, i) => (
            <div key={`${r.at}-${i}`} className="list__row">
              <span className="faint people__when">{when(r.at)}</span>
              <Badge tone={r.kind === "failed" ? "bad" : r.kind === "made" ? "info" : "gray"}>{r.kind}</Badge>
              <span className="people__line">{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
