import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TipProvider } from "./kit";
import { useRoute } from "./data/route";
import { findProject } from "./data/store";
import { ActivityPage } from "./shell/Activity";
import { Assistant } from "./shell/Assistant";
import { Home } from "./shell/Home";
import { Intelligence } from "./shell/Intelligence";
import { Settings } from "./shell/Settings";
import { Sidebar } from "./shell/Sidebar";
import { Portal } from "./portal/Portal";
import { PageHeader, ProjectPage } from "./views/ProjectPage";

type Width = "folded" | "normal" | "wide";
const step: Record<Width, Width> = { wide: "normal", normal: "folded", folded: "folded" };

function usePanel(name: string, initial: Width): [Width, (w: Width) => void] {
  const [w, setW] = useState<Width>(() => (localStorage.getItem(`dell-demo-${name}`) as Width) || initial);
  useEffect(() => localStorage.setItem(`dell-demo-${name}`, w), [name, w]);
  return [w, setW];
}

/** The three-part frame with one shared header line (fixed rule 1). */
export function App() {
  const route = useRoute();
  const [rail, setRail] = usePanel("rail", "normal");
  const [assist, setAssist] = usePanel("assist", window.innerWidth < 1280 ? "folded" : "normal");
  const lastFocus = useRef<"rail" | "assist">("assist");

  useEffect(() => {
    // Escape steps a panel back one level: wide → normal → folded (rulebook §3).
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog], [data-radix-popper-content-wrapper]")) return;
      if (lastFocus.current === "rail") setRail(step[rail]);
      else setAssist(step[assist]);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [rail, assist, setRail, setAssist]);

  if (route.page === "portal") return <TipProvider><Portal view={route.view} /></TipProvider>;

  let main: React.ReactNode;
  if (route.page === "project") {
    const p = findProject(route.project);
    main = p ? (
      <ProjectPage project={p} collection={route.collection} record={route.record} fresh={route.fresh} />
    ) : (
      <><PageHeader><h1 className="pagehead__title">Not found</h1></PageHeader><div className="main__body"><p className="empty">This project is not in the demo.</p></div></>
    );
  } else if (route.page === "intelligence") main = <Intelligence tab={route.tab} item={route.item} />;
  else if (route.page === "settings") main = <Settings section={route.section} />;
  else if (route.page === "activity") main = <ActivityPage />;
  else main = <><div className="pagehead pagehead--home" /><div className="main__body main__body--home"><Home /></div></>;

  return (
    <TipProvider>
      <div className={`frame frame--rail-${rail} frame--assist-${assist}`}>
        <div className="frame__rail" onPointerEnter={() => (lastFocus.current = "rail")} onFocus={() => (lastFocus.current = "rail")}>
          <Sidebar route={route} folded={rail === "folded"} />
          <FoldButton side="rail" folded={rail === "folded"} onClick={() => setRail(rail === "folded" ? "normal" : "folded")} />
          <DragEdge side="rail" onDrop={(wd) => setRail(wd)} />
        </div>
        <main className="frame__main">{main}</main>
        <div className="frame__assist" onPointerEnter={() => (lastFocus.current = "assist")} onFocus={() => (lastFocus.current = "assist")}>
          <Assistant route={route} folded={assist === "folded"} onUnfold={() => setAssist("normal")} />
          <FoldButton side="assist" folded={assist === "folded"} onClick={() => setAssist(assist === "folded" ? "normal" : "folded")} />
          <DragEdge side="assist" onDrop={(wd) => setAssist(wd)} />
        </div>
      </div>
    </TipProvider>
  );
}

/** A small round double arrow on the edge facing the middle, shown while the pointer is over
 *  the panel; the same folded or not, so a folded panel always has a way back. */
function FoldButton({ side, folded, onClick }: { side: "rail" | "assist"; folded: boolean; onClick: () => void }) {
  const toMiddle = side === "rail" ? ChevronsLeft : ChevronsRight;
  const fromMiddle = side === "rail" ? ChevronsRight : ChevronsLeft;
  const Icon = folded ? fromMiddle : toMiddle;
  const label = `${folded ? "Open" : "Fold"} the ${side === "rail" ? "sidebar" : "assistant"}`;
  return (
    <button className={`fold fold--${side}`} onClick={onClick} aria-label={label} title={label}>
      <Icon aria-hidden />
    </button>
  );
}

/** Drag the inner edge: all the way in folds; out past the normal width goes wide. */
function DragEdge({ side, onDrop }: { side: "rail" | "assist"; onDrop: (w: Width) => void }) {
  const start = (e: React.PointerEvent) => {
    const x0 = e.clientX;
    const up = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) * (side === "rail" ? 1 : -1);
      if (dx < -80) onDrop("folded");
      else if (dx > 80) onDrop("wide");
      else if (Math.abs(dx) > 20) onDrop("normal");
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointerup", up);
  };
  return <div className={`dragedge dragedge--${side}`} onPointerDown={start} role="separator" aria-orientation="vertical" aria-label="Drag to resize" />;
}
