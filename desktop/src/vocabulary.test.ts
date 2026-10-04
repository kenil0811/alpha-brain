import { parseSync } from "vite";
import { describe, expect, it } from "vitest";

// The person's word is "project": inside the code a project is still a module (types, routes,
// ids), but no text the window shows may say so. Alpha bugs #28; Bridge needed the same gate
// for its retired names. Comments and code are skipped; JSX text and sentence strings are not.
const sources = import.meta.glob(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const RETIRED = /\b[Mm]odules?\b(?![:_])/;

export function shown(source: string): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; value?: unknown };
    if (n.type === "JSXText" && typeof n.value === "string") out.push(n.value);
    // A string with a space in it is words, not an identifier, a route or a class name.
    else if (n.type === "Literal" && typeof n.value === "string" && n.value.includes(" ")) out.push(n.value);
    else if (n.type === "TemplateElement") {
      const cooked = (n.value as { cooked?: string } | undefined)?.cooked ?? "";
      if (cooked.includes(" ")) out.push(cooked);
    }
    Object.values(node).forEach(visit);
  };
  visit(parseSync("x.tsx", source).program);
  return out.filter((t) => RETIRED.test(t));
}

describe("vocabulary", () => {
  it("never calls a project a module on screen", () => {
    const found = Object.entries(sources).flatMap(([file, text]) => shown(text).map((t) => `${file}: ${t.trim()}`));
    expect(found).toEqual([]);
  });

  it("sees JSX text and sentences, not code or comments", () => {
    expect(shown(`<p>Add a module here</p>`)).toEqual(["Add a module here"]);
    expect(shown(`setError("That module is gone.")`)).toEqual(["That module is gone."]);
    expect(shown(`// the module's page\nconst m = props.module;\nfetch("/api/modules/x");\nconst a = b < c && d > e;`)).toEqual([]);
    expect(shown("const t = `Open the module ${name} now`;")).toEqual(["Open the module "]);
  });
});
