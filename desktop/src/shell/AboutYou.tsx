/**
 * About you (Alpha's AboutYou): the facts Alpha knows about the person, where each came from,
 * and the person's say over every one of them. A suggestion from a project or a conversation
 * waits for a yes.
 */
import { useState } from "react";
import type { Client, Fact, ModuleCard } from "../core/client";
import { humanize } from "../modules/format";
import { InfoTip } from "../ui";
import { OpenRow, OpenTitle, sourceWords } from "./IntelItem";
import "../dataviews/dataviews.css";
import { Button } from "../ui/Button";

export { sourceWords };

export function AboutYou({ client, facts, modules, onChanged, onOpen }: { client: Client; facts: Fact[]; modules: ModuleCard[]; onChanged: () => void; onOpen: (id: string) => void }) {
  const [error, setError] = useState<string | null>(null);
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
              <OpenRow key={s.id} open={() => onOpen(s.id)}>
                <div className="item__body">
                  <OpenTitle open={() => onOpen(s.id)}>
                    {humanize(s.predicate)}: {s.value}
                  </OpenTitle>
                  <div className="item__sub">
                    {from(s)}
                    {s.why ? ` · ${s.why}` : ""}
                  </div>
                </div>
                <span className="row" style={{ gap: 6 }}>
                  <Button size="sm" onClick={() => void act(() => client.decideFact(s.id, true))}>
                    Yes, that's right
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void act(() => client.decideFact(s.id, false))}>
                    No
                  </Button>
                </span>
              </OpenRow>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`section${suggestions.length ? "" : " section--first"}`}>
        <div className="section__head">
          <h2>
            About you <InfoTip content="What Alpha knows and uses across your projects. Every line says where it came from." label="About this" />
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
                  <tr key={f.id} className="row--link" onClick={(e) => !(e.target as Element).closest("button") && onOpen(f.id)}>
                    <td className="about__gutter">
                    </td>
                    <td>
                      <OpenTitle open={() => onOpen(f.id)}>{humanize(f.predicate)}</OpenTitle>
                    </td>
                    <td>{f.value}</td>
                    <td className="faint">{from(f)}</td>
                    <td className="faint">{new Date(f.recorded_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                  </tr>
                ))}
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
