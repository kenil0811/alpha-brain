import { describe, expect, it } from "vitest";
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { parseClipboard, planPaste, readValue } from "./paste";

const row = (id: string, values: Record<string, unknown>): RecordRow => ({ id, revision: 1, values, created_at: "", updated_at: "", provenance: { by: "person" }, seen_at: null, gone_at: null, entity: null });
const fields: FieldInfo[] = [
  { name: "title", kind: "text" }, { name: "company", kind: "text" }, { name: "price", kind: "number" },
  { name: "status", kind: "status", choices: ["Active", "Sold"] }, { name: "when", kind: "date" }, { name: "memo", kind: "long_text" },
];
const byName = new Map(fields.map((f) => [f.name, f]));
const f = (name: string) => byName.get(name)!;

describe("a pasted block (section 4c)", () => {
  it("reads tabs and lines, with quoted cells holding tabs, breaks and quotes", () => {
    expect(parseClipboard("a\tb\nc\td\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseClipboard('"x\ty"\t"say ""hi"""\r\n"two\nlines"\tz')).toEqual([["x\ty", 'say "hi"'], ["two\nlines", "z"]]);
  });

  it("reads numbers, dates, ticks and choices; names what doesn't fit; never guesses a date", () => {
    expect(readValue("$1,200", f("price"))).toEqual({ ok: true, value: 1200 });
    expect(readValue("12%", f("price"))).toEqual({ ok: true, value: 12 });
    expect(readValue("abc", f("price")).ok).toBe(false);
    expect(readValue("13 Oct 2026", f("when"))).toEqual({ ok: true, value: "2026-10-13" });
    expect(readValue("Oct 13, 2026", f("when"))).toEqual({ ok: true, value: "2026-10-13" });
    expect(readValue("13/10/2026", f("when"))).toEqual({ ok: true, value: "2026-10-13" });
    expect(readValue("03/04/2026", f("when"))).toEqual({ ok: false, why: "could be read two ways (day or month first)" });
    expect(readValue("sold", f("status"))).toEqual({ ok: true, value: "Sold" });
    expect(readValue("Pending", f("status")).ok).toBe(false);
    expect(readValue("", f("price"))).toEqual({ ok: true, value: null });
  });

  it("fills from the cell across and down, adds rows past the end, leaves out what it can't write", () => {
    const rows = [row("r1", { title: "Bakery", company: "A", price: 1 }), row("r2", { title: "Cafe", company: null, price: 2 })];
    const columns = ["title", "company", "price", "memo"];
    const plan = planPaste(parseClipboard("Acme\t300\tnote\nBeta\tabc\nGamma\t5"), rows, 0, columns, 1, byName, "title");
    expect(plan.updates).toEqual([{ row: rows[0], values: { company: "Acme", price: 300 } }, { row: rows[1], values: { company: "Beta" } }]);
    expect(plan.adds).toEqual([{ company: "Gamma", price: 5 }]);
    expect(plan.replaced).toBe(2); // A → Acme, 1 → 300
    expect(plan.columns).toEqual(["company", "price"]);
    expect(plan.skipped).toEqual(["Memo: not pasted into (a title, link, file or long text is edited on its own)", '"abc" in Price: isn\'t a number']);
  });
});
