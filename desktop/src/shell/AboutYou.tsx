/**
 * About you (Alpha's AboutYou): the facts Alpha knows about the person, where each came from,
 * and the person's say over every one of them. A suggestion from a project or a conversation
 * waits for a yes; anything can be corrected (a new value supersedes) or forgotten.
 */
import { useState } from "react";
import { X } from "lucide-react";
import type { Client, Fact, ModuleCard } from "../core/client";
import { humanize } from "../modules/format";
import { Button, IconButton, InfoTip } from "../ui";
import "../dataviews/dataviews.css";

/** Where a fact came from, in the person's words. */
export function sourceWords(source: string): string {
  if (source === "person") return "You said so";
  if (source.startsWith("module:")) return "From a project";
  if (source.startsWith("turn:")) return "From a conversation";
  return "Alpha worked it out";
}

export function AboutYou({ client, facts, modules, onChanged }: { client: Client; facts: Fact[]; modules: ModuleCard[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const known = facts.filter((f) => f.state === "accepted");
  const suggestions = facts.filter((f) => f.state === "suggested");
  const project = (source: string) => (source.startsWith("module:") ? modules.find((m) => `module:${m.id}` === source)?.name : undefined);
  const from = (f: Fact) => {
    const name = project(f.source);
    return `${sourceWords(f.source)}${name ? ` (${name})` : ""}`;
  };

  async function act(work: () => Promise<unknown>) {
    try {
      await work();
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function add() {
    const name = field.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!name || !value.trim()) return;
    await act(() => client.addFact(name, value.trim()));
    setField("");
    setValue("");
  }

  return (
    <div className="about">
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      {suggestions.length ? (
        <div className="section section--first">
          <div className="section__head">
            <h2>
              Waiting for your yes <InfoTip content="Projects and the assistant proposed these; nothing uses them until you accept." label="About suggested facts" />
            </h2>
          </div>
          <div className="card list" aria-label="Suggested facts">
            {suggestions.map((s) => (
              <div className="item" key={s.id}>
                <div className="item__body">
                  <b>
                    {humanize(s.predicate)}: {s.value}
                  </b>
                  <div className="item__sub">
                    {from(s)}
                    {s.why ? ` · ${s.why}` : ""}
                  </div>
                </div>
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => void act(() => client.decideFact(s.id, true))}>
                    Yes, that's right
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => void act(() => client.decideFact(s.id, false))}>
                    No
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`section${suggestions.length ? "" : " section--first"}`}>
        <div className="section__head">
          <h2>
            About you <InfoTip content="What Alpha knows and uses across your projects. Every line says where it came from; correct or forget any of it." label="About this" />
          </h2>
          <span className="faint">{known.length ? `${known.length} known` : null}</span>
        </div>
        <div className="card">
          <div className="tablewrap">
            <table className="table table--wrap about__table" aria-label="Facts about you">
              <thead>
                <tr>
                  <th className="about__gutter" />
                  <th>What</th>
                  <th>Value</th>
                  <th>Where from</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {known.map((f) => (
                  <tr key={f.id}>
                    <td className="about__gutter">
                      <IconButton aria-label={`Forget ${humanize(f.predicate)}`} size="sm" className="rowbtn" onClick={() => void act(() => client.forgetFact(f.id))}>
                        <X size={13} strokeWidth={1.75} />
                      </IconButton>
                    </td>
                    <td>{humanize(f.predicate)}</td>
                    <td
                      className="editable"
                      onClick={() => {
                        setEditing(f.id);
                        setDraft(f.value);
                      }}
                    >
                      {editing === f.id ? (
                        <input
                          autoFocus
                          value={draft}
                          aria-label={`Correct ${humanize(f.predicate)}`}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            setEditing(null);
                            if (draft.trim() && draft.trim() !== f.value) void act(() => client.addFact(f.predicate, draft.trim()));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <span title="Click to correct">{f.value}</span>
                      )}
                    </td>
                    <td className="faint">{from(f)}</td>
                    <td className="faint">{new Date(f.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                  </tr>
                ))}
                {/* A new fact, right where the rest live: no separate form card. */}
                <tr>
                  <td className="about__gutter" />
                  <td>
                    <input className="about__input" aria-label="What" value={field} onChange={(e) => setField(e.target.value)} placeholder="degree, target roles…" size={22} onKeyDown={(e) => e.key === "Enter" && void add()} />
                  </td>
                  <td>
                    <input className="about__input" aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="MSc Computer Science (commas make a list)" size={40} onKeyDown={(e) => e.key === "Enter" && void add()} />
                  </td>
                  <td colSpan={2}>
                    <Button size="sm" onClick={() => void add()} disabled={!field.trim() || !value.trim()}>
                      Add
                    </Button>
                  </td>
                </tr>
                {!known.length ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      Nothing known yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
