/**
 * The workspace: the rail, the page it points at, and the conversation beside it. The window
 * gets its core session from the host (or Vite env in a browser), then everything is one
 * client. Pages reload when the core reports a change that touches them (`core/changes.ts`: one
 * poll, versions per scope, nothing while the window is hidden), and when the person does
 * something here. When the core stops answering the window says so and the host brings it back.
 *
 * The rail and Chief of Staff are side panels that fold away and resize by their borders
 * (shell/useDragWidth); neither ever covers the page at full width. Chief of Staff is open on Home and closed on a
 * project page unless opened there (`alpha.assistant.open`); its header holds the Activity
 * bell. Below 1024px the rail shows icons and the panel opens over the page; below 640px a
 * bottom tab bar replaces the rail. The page lives in the address (`#/m/<id>/<section>`), so
 * back and forward work (shell/address). Each place reopens its last chat (`alpha.sessions`). New project
 * makes a blank "Untitled project" at once and opens its page with Chief of Staff beside it.
 */
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Bell, Boxes, Home as HomeIcon, Settings as SettingsIcon } from "lucide-react";
import { Client } from "./core/client";
import { useChanges } from "./core/changes";
import { host } from "./core/host";
import { driftNotice, resolveSession } from "./core/session";
import { AssistantPanel, type ChatChoice } from "./assistant/AssistantPanel";
import { Activity } from "./shell/Activity";
import { Home } from "./shell/Home";
import { Intelligence, type IntelTab } from "./shell/Intelligence";
import { AutomationPage } from "./shell/AutomationPage";
import { CommandMenu } from "./shell/CommandMenu";
import { SkillPage } from "./shell/SkillPage";
import { EntityPage, People } from "./shell/People";
import { Rail, knownSurface, type Surface } from "./shell/Rail";
import { currentHashSurface, pushAddress } from "./shell/address";
import { useDragWidth } from "./shell/useDragWidth";
import { ModulePage } from "./modules/ModulePage";
import { Settings } from "./shell/Settings";
import { ProviderAccounts } from "./shell/models";
import { useTheme } from "./shell/theme";
import { Button, InfoTip, PageHeader, ToastProvider, TooltipProvider, useToast } from "./ui";
import { ZazooIcon } from "./ui/ZazooIcon";
import type { ModuleCard } from "./core/client";

const SURFACE_KEY = "alpha.surface";
export const HANDOFF_KEY = "alpha.handoff";
const SESSIONS_KEY = "alpha.sessions";
const OPEN_KEY = "alpha.assistant.open";
const COMPACT_BELOW = 1024;
const NARROW_BELOW = 640;

function remembered<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* per-window convenience only */
  }
}

type Runtime = { kind: "connecting" } | { kind: "connected"; client: Client; drift?: string | null } | { kind: "unavailable"; reason: string };

export function App({ client: injected }: { client?: Client } = {}) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <Workspace injected={injected} />
      </ToastProvider>
    </TooltipProvider>
  );
}

function Workspace({ injected }: { injected?: Client }) {
  const [runtime, setRuntime] = useState<Runtime>(injected ? { kind: "connected", client: injected } : { kind: "connecting" });
  const [attempt, setAttempt] = useState(0);
  // The address wins when it names a page; otherwise the remembered place.
  const [surface, setSurfaceState] = useState<Surface>(() => currentHashSurface() ?? knownSurface(remembered<unknown>(SURFACE_KEY, null)));
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => remembered<boolean>("alpha.rail.collapsed", false));
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [needs, setNeeds] = useState(0);
  // The chat open in each place ("global" or "module:<id>"), remembered on this Mac.
  const [sessionByScope, setSessionByScope] = useState<Record<string, string | null>>(() => remembered(SESSIONS_KEY, {}));
  // Chief of Staff is open on Home and closed on a project page unless opened there.
  const [openByKind, setOpenByKind] = useState<{ home: boolean; module: boolean }>(() => ({ home: true, module: false, ...remembered<Partial<{ home: boolean; module: boolean }>>(OPEN_KEY, {}) }));
  const [sendNow, setSendNow] = useState<{ text: string; id: number; thread?: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const toast = useToast();
  const [restarted, setRestarted] = useState(false);
  const [draft, setDraft] = useState<{ text: string; send: boolean } | null>(null);
  const [theme, setTheme] = useTheme();
  // Whether any model is connected (Settings -> Models); null until known.
  const [canThink, setCanThink] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [railPeek, setRailPeek] = useState(false);
  const [assistPeek, setAssistPeek] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const assistRef = useRef<HTMLDivElement>(null);

  const rail = useDragWidth("alpha.rail.width", 224, 160, 360, "right");
  const panel = useDragWidth("alpha.panel.width", 380, 280, 560, "left");
  const toggleRail = useCallback(
    () =>
      setRailCollapsed((c) => {
        remember("alpha.rail.collapsed", !c);
        return !c;
      }),
    [],
  );
  const narrow = viewport < NARROW_BELOW;
  const compact = !narrow && viewport < COMPACT_BELOW;
  const panelKind = surface.kind === "module" ? "module" : "home";
  const setOpenHere = useCallback(
    (open: boolean) =>
      setOpenByKind((current) => {
        const next = { ...current, [panelKind]: open };
        remember(OPEN_KEY, next);
        return next;
      }),
    [panelKind],
  );
  const assistOpen = compact || narrow ? assistPeek : openByKind[panelKind];

  const setSurface = useCallback((next: Surface) => {
    setSurfaceState(next);
    remember(SURFACE_KEY, next);
    pushAddress(next);
  }, []);
  // Back and forward move between pages; a typed address opens one.
  useEffect(() => {
    const onPop = () => {
      const named = currentHashSurface();
      if (named) {
        setSurfaceState(named);
        remember(SURFACE_KEY, named);
      }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    pushAddress(surface);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
    // once: the listeners read the address, not this render's surface
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ⌘K (or Ctrl+K) anywhere in the window: search everything.
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const openAssistant = useCallback(() => {
    if (compact || narrow) setAssistPeek(true);
    else setOpenHere(true);
  }, [compact, narrow, setOpenHere]);
  const closeAssistant = () => {
    if (compact || narrow) setAssistPeek(false);
    else setOpenHere(false);
  };
  const rememberSession = useCallback((scope: string, id: string | null | undefined) => {
    setSessionByScope((current) => {
      const next = { ...current };
      if (id === undefined) delete next[scope];
      else next[scope] = id;
      remember(SESSIONS_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Escape folds the panel that has focus (unless a menu or dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const active = document.activeElement;
      if (railRef.current?.contains(active)) {
        if (compact) setRailPeek(false);
        else if (!railCollapsed) toggleRail();
      } else if (assistRef.current?.contains(active)) {
        if (compact || narrow) setAssistPeek(false);
        else setOpenHere(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compact, narrow, railCollapsed, toggleRail, setOpenHere]);

  useEffect(() => {
    if (injected) return;
    let cancelled = false;
    void resolveSession().then(async (resolution) => {
      if (cancelled) return;
      if (resolution.kind === "unavailable") {
        setRuntime({ kind: "unavailable", reason: resolution.reason });
        return;
      }
      const client = new Client(resolution.session);
      try {
        await client.health();
        if (!cancelled) setRuntime({ kind: "connected", client, drift: driftNotice(resolution.session) });
      } catch (e) {
        if (!cancelled) setRuntime({ kind: "unavailable", reason: e instanceof Error ? e.message : String(e) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [injected, attempt]);
  useEffect(() => {
    if (runtime.kind !== "unavailable" || injected) return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), 4000);
    return () => clearTimeout(timer);
  }, [runtime, injected]);

  const client = runtime.kind === "connected" ? runtime.client : null;
  const moduleOf = useCallback((table: string) => modules.find((m) => m.tables.some((t) => t.name === table))?.id, [modules]);
  const { versions, down, bump, poll } = useChanges(client, moduleOf);
  const changed = bump;

  // The rail's projects and the bell, refreshed when the change poll says Home moved.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const load = () => {
      client
        .home()
        .then((home) => {
          if (cancelled) return;
          setModules(home.modules);
        })
        .catch(() => undefined);
      // The bell: what waits on the person, and automations whose last run failed.
      client
        .attention()
        .then((a) => !cancelled && setNeeds(a.count))
        .catch(() => undefined);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [client, versions.home]);

  // Whether Alpha can think: checked at start and every minute (the person may sign in or out
  // elsewhere).
  useEffect(() => {
    if (!client) return;
    const check = () =>
      client
        .modelProviders()
        .then((rows) => setCanThink(rows.some((r) => r.state === "connected")))
        .catch(() => undefined);
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [client, versions.all]);

  // The host says when it started the core again: look at everything afresh and say so.
  useEffect(() => {
    let stop: (() => void) | null = null;
    void host.onEvent("core-restarted", () => {
      setRestarted(true);
      void poll();
      bump();
    }).then((off) => {
      stop = off;
    });
    return () => stop?.();
  }, [bump, poll]);
  useEffect(() => {
    if (!restarted) return;
    const timer = setTimeout(() => setRestarted(false), 8000);
    return () => clearTimeout(timer);
  }, [restarted]);

  // The companion hands things over through shared storage: open a project, the conversation.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HANDOFF_KEY || !event.newValue) return;
      try {
        const handoff = JSON.parse(event.newValue) as { surface?: Surface; panel?: boolean; conversation?: string };
        if (handoff.surface) setSurface(knownSurface(handoff.surface));
        if (handoff.panel) openAssistant();
        // The companion's conversation opens in the panel of the place it belongs to.
        if (handoff.conversation) rememberSession(handoff.surface?.kind === "module" ? `module:${handoff.surface.id}` : "global", handoff.conversation);
        changed();
      } catch {
        /* not a handoff */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setSurface, changed, openAssistant, rememberSession]);

  const ask = useCallback(
    (text: string) => {
      setDraft({ text, send: false });
      openAssistant();
    },
    [openAssistant],
  );
  // New project: a blank "Untitled project" at once, its page, and Chief of Staff open beside
  // it on the thread it is made in.
  const startNew = useCallback(() => {
    if (!client) return;
    void client
      .createModule()
      .then((made) => {
        setModules((all) => [...all, made]);
        if (made.creation?.thread) rememberSession(`module:${made.id}`, made.creation.thread);
        setSurface({ kind: "module", id: made.id });
        if (compact || narrow) setAssistPeek(true);
        else
          setOpenByKind((current) => {
            const next = { ...current, module: true };
            remember(OPEN_KEY, next);
            return next;
          });
        changed();
      })
      .catch((e: unknown) => toast.show(e instanceof Error ? e.message : "Couldn't make a new project."));
  }, [client, rememberSession, setSurface, compact, narrow, changed, toast]);

  // A blank project left before anything was said is removed (nothing of it would be kept).
  const lastModule = useRef<string | null>(null);
  useEffect(() => {
    const left = lastModule.current;
    lastModule.current = surface.kind === "module" ? surface.id : null;
    if (!client || !left || left === lastModule.current) return;
    void client
      .module(left)
      .then((m) => {
        if (m.creation?.stage === "new" && m.name.startsWith("Untitled project") && !m.activity.some((e) => e.kind === "said") && !m.tables.length) return client.removeModule(left).then(changed);
      })
      .catch(() => undefined);
  }, [client, surface, changed]);

  const scopeModule = surface.kind === "module" ? (modules.find((m) => m.id === surface.id) ?? null) : null;
  const scopeKey = scopeModule ? `module:${scopeModule.id}` : "global";
  const chat: ChatChoice = scopeKey in sessionByScope ? sessionByScope[scopeKey] : scopeModule ? null : undefined;
  const bell = (
    <button
      type="button"
      className={surface.kind === "activity" ? "iconbtn bell iconbtn--on" : "iconbtn bell"}
      aria-label={needs ? `Activity, ${needs} need you` : "Activity"}
      title="Activity"
      aria-current={surface.kind === "activity" ? "page" : undefined}
      onClick={() => setSurface({ kind: "activity" })}
    >
      <Bell size={16} />
      {needs ? <span className="bell__count">{needs > 9 ? "9+" : needs}</span> : null}
    </button>
  );
  const scopeName =
    surface.kind === "module" ? (scopeModule?.name ?? "Project") : surface.kind === "home" ? "Home" : surface.kind === "activity" ? "Activity" : surface.kind === "settings" ? "Settings" : surface.kind === "people" || surface.kind === "entity" ? "People & Companies" : "Intelligence";

  // Folded, the rail is icons only; in a compact window it is icons until peeked open.
  const railFolded = compact ? !railPeek : railCollapsed;
  const railWidth = railFolded ? 76 : rail.width;
  const assistantWidth = panel.width;
  const docked = !compact && !narrow;

  return (
    <div className={`app${narrow ? " app--narrow" : ""}${rail.active || panel.active ? " app--resizing" : ""}`} style={{ ["--rail-w" as string]: `${railWidth}px`, ["--panel-w" as string]: `${assistantWidth}px` }}>
      <div ref={railRef} className="app__rail" hidden={narrow}>
        <Rail surface={surface} modules={modules} runtime={down ? "lost" : runtime.kind} onGo={setSurface} onNew={startNew} client={client} onChanged={changed} collapsed={railFolded} onToggleCollapsed={compact ? () => setRailPeek((v) => !v) : toggleRail} width={railWidth} />
      </div>
      {docked && !railFolded ? <div className={`resizer resizer--rail${rail.active ? " resizer--active" : ""}`} onPointerDown={rail.onPointerDown} role="separator" aria-orientation="vertical" aria-label="Resize the sidebar" /> : null}
      {docked && client && assistOpen ? <div className={`resizer resizer--panel${panel.active ? " resizer--active" : ""}`} onPointerDown={panel.onPointerDown} role="separator" aria-orientation="vertical" aria-label="Resize Chief of Staff" /> : null}
      <main className="main">
        {down ? (
          <div className="corenote" role="alert">
            <span>Alpha's core isn't answering ({down}). The host starts it again on its own; this clears when it is back.</span>
            <Button size="sm" onClick={() => void poll()}>
              Try now
            </Button>
          </div>
        ) : restarted ? (
          <div className="corenote corenote--ok" role="status">
            Alpha's core started again. Anything that was running is open to ask again.
          </div>
        ) : null}
        {runtime.kind !== "connected" ? (
          <div className="page">
            <PageHeader title={runtime.kind === "connecting" ? "Starting Alpha…" : "Alpha's core isn't running"} />
            {runtime.kind === "unavailable" ? (
              <>
                <p className="notice page__line" role="alert">
                  {runtime.reason}
                </p>
                <p className="muted page__line">
                  Alpha keeps trying on its own every few seconds.{" "}
                  <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>
                    Try again now
                  </button>
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <>
            {runtime.drift ? (
              <p className="notice page__line" role="status">
                {runtime.drift}
              </p>
            ) : null}
            {canThink === false && surface.kind !== "settings" ? (
              <div className="page firstrun">
                <div className="card firstrun__card">
                  <div className="firstrun__head">
                    <h2>
                      Connect a model to start
                      <InfoTip text="Alpha thinks with a model you connect: your Claude or ChatGPT account, an API key, or Ollama on this Mac." />
                    </h2>
                    <button type="button" className="btn btn--sm" onClick={() => setCanThink(null)}>
                      Done
                    </button>
                  </div>
                  <ProviderAccounts client={runtime.client} />
                </div>
              </div>
            ) : null}
            {surface.kind === "home" ? (
              <Home client={runtime.client} version={versions.home} onGo={setSurface} onChanged={changed} onAsk={ask} onNew={startNew} onOpenThread={(id) => { rememberSession(scopeKey, id); openAssistant(); }} />
            ) : surface.kind === "module" ? (
              <ModulePage
                key={surface.id}
                client={runtime.client}
                moduleId={surface.id}
                version={(versions.modules[surface.id] ?? 0) + versions.all}
                onChanged={changed}
                onGo={setSurface}
                section={surface.section}
                onSection={(section) => setSurface({ kind: "module", id: surface.id, section })}
                modules={modules}
                onQuickEntry={(text) => {
                  openAssistant();
                  setSendNow({ text, id: Date.now() });
                }}
                onDescribe={(text) => {
                  const thread = scopeModule?.creation?.thread;
                  if (!thread) return;
                  rememberSession(scopeKey, thread);
                  openAssistant();
                  setSendNow({ text, id: Date.now(), thread });
                }}
                onOpenSession={(id) => {
                  rememberSession(scopeKey, id);
                  openAssistant();
                }}
              />
            ) : surface.kind === "settings" ? (
              // P2's Settings takes the section from the address (`#/settings/<section>`).
              <Settings {...({ client: runtime.client, theme, onTheme: setTheme, section: surface.section, onSection: (section: string) => setSurface({ kind: "settings", section }) } as ComponentProps<typeof Settings>)} />
            ) : surface.kind === "people" ? (
              <People client={runtime.client} version={versions.people} onOpen={(id) => setSurface({ kind: "entity", id })} />
            ) : surface.kind === "entity" ? (
              <EntityPage key={surface.id} client={runtime.client} id={surface.id} version={versions.people} onBack={() => setSurface({ kind: "people" })} onOpen={(id) => setSurface({ kind: "entity", id })} onChanged={changed} />
            ) : surface.kind === "skill" ? (
              <SkillPage key={surface.name} client={runtime.client} name={surface.name} version={versions.intelligence} onGo={setSurface} onAsk={ask} onChanged={changed} />
            ) : surface.kind === "automation" ? (
              <AutomationPage key={surface.id} client={runtime.client} id={surface.id} version={versions.intelligence} onGo={setSurface} onAsk={ask} onChanged={changed} />
            ) : surface.kind === "intelligence" ? (
              <Intelligence client={runtime.client} modules={modules} tab={(surface.tab ?? "brain") as IntelTab} version={versions.intelligence} onTab={(tab) => setSurface({ kind: "intelligence", tab })} onGo={setSurface} onChanged={changed} />
            ) : (
              <Activity client={runtime.client} version={versions.activity} onChanged={changed} />
            )}
          </>
        )}
      </main>
      {client && assistOpen ? (
        <div ref={assistRef} id="panel-right" className={narrow ? "assist assist--overlay" : "assist"} style={docked ? { width: assistantWidth } : undefined}>
          <AssistantPanel
            client={client}
            onCollapse={closeAssistant}
            scopeName={scopeName}
            module={scopeModule}
            version={versions.conversation}
            onChanged={changed}
            draft={draft}
            onDraftTaken={() => setDraft(null)}
            thread={chat}
            onThread={(id) => rememberSession(scopeKey, id)}
            headerEnd={bell}
            sendNow={sendNow}
            cardsOnPage={surface.kind === "module"}
          />
        </div>
      ) : client && !narrow ? (
        <div className="assist assist--collapsed" style={{ width: 48 }}>
          <button type="button" className="assist__open" onClick={openAssistant} aria-label="Open Chief of Staff" title="Chief of Staff">
            <ZazooIcon size={30} label="" />
          </button>
          {bell}
        </div>
      ) : null}
      {narrow && client ? (
        <>
          {drawer ? (
            <div className="drawer-sheet" onClick={() => setDrawer(false)}>
              <div className="drawer-sheet__panel" onClick={(e) => e.stopPropagation()}>
                <Rail
                  surface={surface}
                  modules={modules}
                  runtime={runtime.kind}
                  onGo={(s) => {
                    setSurface(s);
                    setDrawer(false);
                  }}
                  onNew={() => {
                    setDrawer(false);
                    startNew();
                  }}
                  client={client}
                  onChanged={changed}
                  collapsed={false}
                  onToggleCollapsed={() => setDrawer(false)}
                  width={280}
                />
              </div>
            </div>
          ) : null}
          <nav className="tabbar" aria-label="Alpha">
            <button type="button" className="tabbar__btn" aria-current={surface.kind === "home" ? "page" : undefined} onClick={() => setSurface({ kind: "home" })}>
              <HomeIcon size={18} />
              Home
            </button>
            <button type="button" className="tabbar__btn" aria-current={drawer ? "page" : undefined} onClick={() => setDrawer(true)}>
              <Boxes size={18} />
              Projects
            </button>
            <button type="button" className="tabbar__btn" aria-current={assistOpen ? "page" : undefined} onClick={() => setAssistPeek((v) => !v)}>
              <ZazooIcon size={20} label="" />
              Chief of Staff
            </button>
            <button type="button" className="tabbar__btn" aria-current={surface.kind === "settings" ? "page" : undefined} onClick={() => setSurface({ kind: "settings" })}>
              <SettingsIcon size={18} />
              Settings
            </button>
          </nav>
        </>
      ) : null}
      {client ? <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} client={client} modules={modules} onGo={setSurface} onAsk={ask} /> : null}
    </div>
  );
}
