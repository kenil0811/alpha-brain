import { describe, expect, it } from "vitest";
import { fold, keep, pagesFor, shotName } from "./check-pages";

const world = {
  modules: [{ id: "m_1", name: "Deals" }],
  skills: [{ name: "linkedin_connections" }],
  automations: [{ id: "a_1", title: "Daily deals" }],
  people: [{ id: "e_1", name: "Ada" }],
};

describe("the pages of a world", () => {
  it("names every address the window answers to, once", () => {
    const pages = pagesFor(world);
    const paths = pages.map((p) => p.path);
    expect(paths).toContain("/home");
    expect(paths).toContain("/people/e_1");
    expect(paths).toContain("/m/m_1");
    expect(paths).toContain("/intelligence/knowledge");
    expect(paths).toContain("/intelligence/skills/linkedin_connections");
    expect(paths).toContain("/intelligence/automations/a_1");
    expect(paths).toContain("/settings");
    expect(new Set(paths).size).toBe(paths.length);
    expect(pages.find((p) => p.path === "/m/m_1")?.title).toBe("Module: Deals");
  });

  it("escapes an id with a slash in it so the address stays one page", () => {
    const [page] = pagesFor({ ...world, modules: [{ id: "a/b" }], people: [], skills: [], automations: [] }).filter((p) => p.path.startsWith("/m/"));
    expect(page.path).toBe("/m/a%2Fb");
  });

  it("keeps only the pages under the prefixes asked for", () => {
    const pages = pagesFor(world);
    expect(keep(pages, ["intelligence"]).map((p) => p.path)).toEqual([
      "/intelligence",
      "/intelligence/skills",
      "/intelligence/automations",
      "/intelligence/connections",
      "/intelligence/knowledge",
      "/intelligence/skills/linkedin_connections",
      "/intelligence/automations/a_1",
    ]);
    expect(keep(pages, ["/home", "settings"]).map((p) => p.path)).toEqual(["/home", "/settings"]);
    expect(keep(pages, undefined)).toBe(pages);
    expect(keep(pages, [])).toBe(pages);
  });
});

describe("the findings", () => {
  it("folds repeats of one finding into a count", () => {
    const folded = fold([
      { kind: "text clipped", detail: "span.cell needs 200px, has 100px" },
      { kind: "text clipped", detail: "span.cell needs 200px, has 100px" },
      { kind: "request 404", detail: "core/api/x" },
    ]);
    expect(folded).toEqual([
      { kind: "text clipped", detail: "span.cell needs 200px, has 100px", count: 2 },
      { kind: "request 404", detail: "core/api/x", count: 1 },
    ]);
  });

  it("names a screenshot after the page and the size", () => {
    expect(shotName("/intelligence/skills/linkedin_connections", { width: 860, height: 560, scheme: "light" })).toBe("intelligence-skills-linkedin_connections@860x560-light.png");
    expect(shotName("/m/a%2Fb", { width: 1240, height: 820, scheme: "dark" })).toBe("m-a-2Fb@1240x820-dark.png");
  });
});
