import { useEffect, useState } from "react";

/** Pages have addresses, so Back and Forward work (rulebook §16). Hash routes keep the demo a
 *  static site that opens anywhere. */
export type Route =
  | { page: "home" }
  | { page: "project"; project: string; collection?: string; record?: string; fresh?: boolean }
  | { page: "intelligence"; tab: string; item?: string }
  | { page: "settings"; section: string }
  | { page: "activity" }
  | { page: "portal"; view: string };

export function parse(hash: string): Route {
  const [path, query] = hash.split("?");
  const parts = path.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [head, a, b, c] = parts;
  if (head === "p" && a) return { page: "project", project: a, collection: b, record: c, fresh: query === "new" };
  if (head === "intelligence") return { page: "intelligence", tab: a ?? "agents", item: b };
  if (head === "settings") return { page: "settings", section: a ?? "overview" };
  if (head === "activity") return { page: "activity" };
  if (head === "portal") return { page: "portal", view: a ?? "home" };
  return { page: "home" };
}

export const href = {
  home: () => "#/",
  project: (p: string, c?: string) => (c ? `#/p/${p}/${c}` : `#/p/${p}`),
  record: (p: string, c: string, id: string) => `#/p/${p}/${c}/${encodeURIComponent(id)}`,
  intelligence: (tab = "agents", item?: string) => (item ? `#/intelligence/${tab}/${item}` : `#/intelligence/${tab}`),
  settings: (s = "overview") => `#/settings/${s}`,
  activity: () => "#/activity",
  portal: (v = "home") => `#/portal/${v}`,
};

export function go(to: string) {
  window.location.hash = to.replace(/^#/, "");
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setR(parse(window.location.hash));
      document.querySelector(".main__body")?.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
