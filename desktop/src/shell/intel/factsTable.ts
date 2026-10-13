/**
 * Intelligence › Knowledge › About you as a table (13 Oct, Q42 section 7d; the feature from pull
 * request #5, the view main's own): every fact Alpha holds about the person, a row of the one data
 * view with what it is, its value, where it came from (main's words, `factOrigin`), since when,
 * how sure and whether it is known or only suggested. A suggested fact's Yes and No sit at its
 * row's start. The core sends the person's current facts, so there is no subject or end column.
 */
import type { Fact, RecordRow, TableDesc } from "../../core/client";
import { humanize } from "../../modules/format";
import type { Colours } from "../../modules/views/engine";
import { factOrigin } from "../facts";

export const FACT_STATE: Record<string, string> = { accepted: "Known", suggested: "Suggested" };

export function factsTable(facts: Fact[]): TableDesc {
  return {
    name: "intel_facts",
    title: "About you",
    module: null,
    title_field: "fact",
    records: facts.length,
    readonly: true,
    fields: [
      { name: "fact", kind: "text", label: "Fact" },
      { name: "value", kind: "text", label: "Value" },
      { name: "origin", kind: "text", label: "Where it came from" },
      { name: "since", kind: "datetime", label: "Since" },
      { name: "sure", kind: "number", label: "How sure", unit: "%" },
      { name: "state", kind: "status", label: "State", choices: Object.values(FACT_STATE), done_choices: [FACT_STATE.accepted] },
    ],
  };
}

export function factRow(f: Fact): RecordRow {
  return {
    id: f.id,
    revision: 1,
    created_at: f.recorded_at,
    updated_at: f.recorded_at,
    provenance: {},
    values: {
      fact: humanize(f.predicate),
      value: f.value,
      origin: factOrigin(f),
      since: f.valid_from,
      sure: Math.round(f.confidence * 100),
      state: FACT_STATE[f.state] ?? humanize(f.state),
    },
  };
}

export const FACT_COLOURS: Colours = { tint: null, values: { state: { [FACT_STATE.accepted]: "good", [FACT_STATE.suggested]: "warn" } }, rules: {} };
