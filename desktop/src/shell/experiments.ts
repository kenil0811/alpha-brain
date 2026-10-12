/** Experimental features (12 Oct, the owner): each off by default, kept per window like the theme. */
import { useCallback, useEffect, useState } from "react";

export const EXPERIMENTS = [
  { name: "bubbles", label: "Bubbles", info: "When Alpha answers about the page in the middle, it can point at parts of it with small bubbles. Hover one to read it; scrub across it or press Delete to pop it." },
] as const;
export type Experiment = (typeof EXPERIMENTS)[number]["name"];

const KEY = "alpha.experiments";
const EVENT = "alpha-experiments";

export function experimentOn(name: Experiment): boolean {
  try {
    return (JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]).includes(name);
  } catch {
    return false;
  }
}

export function useExperiment(name: Experiment): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? false : experimentOn(name)));
  useEffect(() => {
    const sync = () => setOn(experimentOn(name));
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [name]);
  const set = useCallback(
    (next: boolean) => {
      try {
        const all = new Set(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]);
        if (next) all.add(name);
        else all.delete(name);
        window.localStorage.setItem(KEY, JSON.stringify([...all]));
      } catch {
        /* per-window convenience only */
      }
      setOn(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [name],
  );
  return [on, set];
}
