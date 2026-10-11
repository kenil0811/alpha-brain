// @vitest-environment node
/**
 * Source rules the UI rulebook asks for and jsdom can't see broken, checked by reading the
 * source (UX audit, ux-audit-pr5 §7 item 8). Each failure lists file:line. Scans
 * src/**\/*.{ts,tsx,css} except tests and avatar/art.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === "test" || p.endsWith(join("avatar", "art")) ? [] : files(p);
    return /\.(tsx?|css)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** Comments blanked (newlines kept, so indexes still map to lines). */
function strip(text: string, css: boolean): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return css ? text.replace(/\/\*[\s\S]*?\*\//g, blank) : text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(?<![:"'`\\])\/\/.*$/gm, blank);
}

const SOURCES = files(SRC).map((p) => {
  const rel = relative(SRC, p);
  const css = p.endsWith(".css");
  return { rel, css, text: strip(readFileSync(p, "utf8"), css) };
});

const lineOf = (text: string, i: number) => text.slice(0, i).split("\n").length;

function scan(re: RegExp, pick: (f: (typeof SOURCES)[number]) => boolean, keep?: (m: RegExpExecArray, text: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of SOURCES) {
    if (!pick(f)) continue;
    for (const m of f.text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
      if (keep && !keep(m as RegExpExecArray, f.text)) continue;
      out.push(`${f.rel}:${lineOf(f.text, m.index! + (m[0].length - m[0].trimStart().length))}  ${m[0].trim().replace(/\s+/g, " ").slice(0, 70)}`);
    }
  }
  return out;
}

const tsx = (f: { css: boolean }) => !f.css;
const G = "(?:↑|↓|←|→|›|‹|✓|✔|⊘|★|☆|▦|⌄|▾|×|⋯|\\+|−|·)";

describe("source rules", () => {
  it("uses icons, not text glyphs", () => {
    const hits = [
      // a JSX text node that is just the glyph: <button>×</button>
      ...scan(new RegExp(`>\\s*${G}\\s*<`), tsx),
      // a JSX child or icon slot holding only the glyph: {"×"}, icon="›", cond ? "▾" : "›"
      ...scan(new RegExp(`\\{\\s*["'\`]${G}["'\`]\\s*\\}`), tsx),
      ...scan(new RegExp(`\\bicon=\\{?\\s*["'\`]${G}["'\`]`), tsx),
      ...scan(new RegExp(`[?:]\\s*["'\`]${G}["'\`]\\s*[:})]`), tsx),
    ];
    expect([...new Set(hits)], "glyphs as icons (use ui/icons.ts)").toEqual([]);
  });

  it("uses the kit's controls, not native ones", () => {
    const allowed = (f: { rel: string; css: boolean }) => tsx(f) && !/^ui\/(DateField|NumberField)\.tsx$/.test(f.rel);
    const hits = [
      ...scan(/<select\b/, allowed),
      ...scan(/\btype=\{?["'](date|datetime-local|number|time)["']/, allowed),
      ...scan(/\bwindow\.(alert|confirm|prompt)\(/, tsx),
      ...scan(/(?<![\w$.])(alert|confirm|prompt)\(/, tsx, (m, t) => !/function\s+$/.test(t.slice(Math.max(0, m.index - 12), m.index))),
    ];
    expect(hits, "native controls and dialogs (use ui/Dropdown, DateField, NumberField, Confirm)").toEqual([]);
  });

  it("does not use MoreHorizontal", () => {
    expect(scan(/\bMoreHorizontal\b/, tsx), "MoreHorizontal (the rulebook's More is vertical)").toEqual([]);
  });

  it("spaces, rounds and sizes type with tokens, not raw px", () => {
    const props = "padding(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap|inset|top|right|bottom|left|border-radius|font-size";
    const hits = scan(new RegExp(`(?<=[{;]\\s*)(?:${props})\\s*:[^;{}]*`), (f) => f.css, (m) => {
      const value = m[0].slice(m[0].indexOf(":") + 1);
      return [...value.matchAll(/(-?\d*\.?\d+)px\b/g)].some((n) => ![0, 1, 2].includes(Math.abs(Number(n[1]))));
    });
    expect(hits, "raw px (use the spacing, radius and type tokens)").toEqual([]);
  });

  it("uses the 11px step only for the folded labels (rulebook §1: 12px is the least for reading)", () => {
    const allowed = new Set([".rail--collapsed .navbtn__text", ".assist__striplabel"]);
    const hits = scan(/var\(--text-xs\)/, () => true, (m, t) => {
      const open = t.lastIndexOf("{", m.index);
      const selector = t.slice(t.lastIndexOf("}", open) + 1, open).trim();
      return !allowed.has(selector);
    });
    expect(hits, "--text-xs outside the folded rail and assistant labels (use --text-sm)").toEqual([]);
  });

  it("spaces, rounds and sizes type with tokens in a component's inline style too", () => {
    // spacing, type and corners as a literal number or "Npx"; width, left, a transform or a colour
    // computed from state is fine, and so is a token (`"var(--space-4)"`)
    const props = "padding\\w*|margin\\w*|gap|rowGap|columnGap|fontSize|lineHeight|letterSpacing|borderRadius\\w*";
    const hits = scan(/style=\{\{[^}]*\}\}/, tsx, (m) => new RegExp(`\\b(?:${props})\\s*:\\s*-?\\d`).test(m[0]) || /["'`][^"'`]*\b\d+(?:\.\d+)?px\b/.test(m[0]));
    expect(hits, "inline px or numbers for spacing, type or corners (use a class and the tokens)").toEqual([]);
  });

  it("sizes icons with ICON / ICON_SM, not a number", () => {
    // icons: what ui/icons.ts exports, and whatever a file takes from lucide-react directly
    const names = (list: string) => list.split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!).filter(Boolean);
    const kit = new Set(names(/export\s*\{([^}]*)\}/.exec(readFileSync(join(SRC, "ui", "icons.ts"), "utf8"))?.[1] ?? ""));
    const hits = scan(/<([A-Z]\w*)\b[^<>]*?\bsize=\{\s*\d+(\.\d+)?\s*\}/, tsx, (m, t) => {
      const lucide = [...t.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g)].flatMap((i) => names(i[1]));
      return kit.has(m[1]) || lucide.includes(m[1]);
    });
    expect(hits, "size={N} on an icon (use ICON or ICON_SM)").toEqual([]);
  });

  it("waits in TableView only for the row's double-click", () => {
    const hits = scan(/\bsetTimeout\(/, (f) => f.rel === join("modules", "views", "TableView.tsx"), (m, t) => {
      // the call's last top-level argument is its delay; none is the next tick, which is no wait
      let depth = 0, i = m.index + m[0].length, lastComma = -1;
      for (; i < t.length; i++) {
        const c = t[i];
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
        else if (c === "," && depth === 0) lastComma = i;
      }
      return lastComma >= 0 && t.slice(lastComma + 1, i).trim() !== "OPEN_DELAY_MS";
    });
    expect(hits, "setTimeout delays other than OPEN_DELAY_MS").toEqual([]);
  });
});
