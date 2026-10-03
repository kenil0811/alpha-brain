/**
 * The workspace: the rail, the page it points at, and the conversation beside it. The window
 * gets its core session from the host (or Vite env in a browser), then everything is one
 * client. Pages reload when the core reports a change (a turn finished, a row was edited).
 *
 * The rail and Chief of Staff are side panels that collapse, expand and resize (ui/panel);
 * neither ever covers the page at full width. Chief of Staff is open on Home and closed on a
 * project page unless opened there (`alpha.assistant.open`); its header holds the Activity
 * bell. Below 1024px the rail shows icons and the panel opens over the page; below 640px a
 * bottom tab bar replaces the rail. The page lives in the address (`#/m/<id>/<section>`), so
 * back and forward work. Each place reopens its last chat (`alpha.sessions`). New project
 * makes a blank "Untitled project" at once and opens its page with Chief of Staff beside it.
 */
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Bell, Boxes, Home as HomeIcon, Settings as SettingsIcon } from "lucide-react";
import { Client } from "./core/client";
import { driftNotice, resolveSession } from "./core/session";
import { AssistantPanel, type ChatChoice } from "./assistant/AssistantPanel";
import { Activity } from "./shell/Activity";
import { CommandMenu } from "./shell/CommandMenu";
import { Home } from "./shell/Home";
import { Intelligence, type IntelTab } from "./shell/Intelligence";
import { EntityPage, People } from "./shell/People";
import { Rail, knownSurface, surfaceFromPath, surfacePath, type Surface } from "./shell/Rail";
import { ModulePage } from "./modules/ModulePage";
import { Settings } from "./shell/Settings";
import { ProviderAccounts } from "./shell/models";
import { useTheme } from "./shell/theme";
import { InfoTip, PageHeader, ResizeHandle, ToastProvider, TooltipProvider, usePanelControl, useToast } from "./ui";
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
  const [surface, setSurfaceState] = useState<Surface>(() => surfaceFromPath(window.location.hash) ?? knownSurface(remembered<unknown>(SURFACE_KEY, null)));
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [needs, setNeeds] = useState(0);
  // The chat open in each place ("global" or "module:<id>"), remembered on this Mac.
  const [sessionByScope, setSessionByScope] = useState<Record<string, string | null>>(() => remembered(SESSIONS_KEY, {}));
  // Chief of Staff is open on Home and closed on a project page unless opened there.
  const [openByKind, setOpenByKind] = useState<{ home: boolean; module: boolean }>(() => ({ home: true, module: false, ...remembered<Partial<{ home: boolean; module: boolean }>>(OPEN_KEY, {}) }));
  const [sendNow, setSendNow] = useState<{ text: string; id: number; thread?: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();
  // Whether any model is connected (Settings -> Models); null until known.
  const [canThink, setCanThink] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [railPeek, setRailPeek] = useState(false);
  const [assistPeek, setAssistPeek] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const assistRef = useRef<HTMLDivElement>(null);

  const railPanel = usePanelControl({ defaultWidth: 220, minWidth: 76, maxWidth: 360, storageKeyWidth: "alpha.rail.width", storageKeyCollapsed: "alpha.rail.collapsed", snap: true, snapMidpoint: 148 });
  const assistantPanel = usePanelControl({ defaultWidth: 286, minWidth: 260, maxWidth: 520, storageKeyWidth: "alpha.assistant.width", storageKeyCollapsed: "alpha.assistant.collapsed" });
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
  const assistOpen = compact || narrow ? assistPeek : !assistantPanel.collapsed && openByKind[panelKind];

  const setSurface = useCallback((next: Surface) => {
    setSurfaceState(next);
    remember(SURFACE_KEY, next);
    const path = `#${surfacePath(next)}`;
    if (window.location.hash !== path) window.history.pushState(null, "", path);
  }, []);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const openAssistant = useCallback(() => {
    if (compact || narrow) setAssistPeek(true);
    else {
      assistantPanel.setCollapsed(false);
      setOpenHere(true);
    }
  }, [compact, narrow, assistantPanel, setOpenHere]);
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
    const onPop = () => setSurfaceState(surfaceFromPath(window.location.hash) ?? { kind: "home" });
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Escape steps the panel that has focus down one level (unless a menu or dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const active = document.activeElement;
      if (railRef.current?.contains(active)) railPanel.handleEscape();
      else if (assistRef.current?.contains(active)) {
        if (compact) setAssistPeek(false);
        else assistantPanel.handleEscape();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [railPanel, assistantPanel, compact]);

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

  // The rail's projects and the Home badge, refreshed on every change and every 20 s (the core
  // may have done something on its own: a folder changed, a calendar sync).
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
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, version]);

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
  }, [client]);

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
      setDraft(text);
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
        else {
          assistantPanel.setCollapsed(false);
          setOpenByKind((current) => {
            const next = { ...current, module: true };
            remember(OPEN_KEY, next);
            return next;
          });
        }
        changed();
      })
      .catch((e: unknown) => toast.show(e instanceof Error ? e.message : "Couldn't make a new project."));
  }, [client, rememberSession, setSurface, compact, narrow, assistantPanel, changed, toast]);

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

  const railWidth = railPanel.collapsed ? 76 : railPanel.displayWidth;
  const assistantWidth = assistantPanel.displayWidth;

  return (
    <div className={narrow ? "app app--narrow" : "app"}>
      <div ref={railRef} className="app__rail" hidden={narrow}>
        <Rail
          surface={surface}
          modules={modules}
          runtime={runtime.kind}
          onGo={setSurface}
          onNew={startNew}
          client={client}
          onChanged={changed}
          panel={compact ? { ...railPanel, collapsed: !railPeek, displayWidth: railPeek ? railPanel.width : 76, toggleCollapsed: () => setRailPeek((v) => !v) } : { ...railPanel, displayWidth: railWidth }}
        />
      </div>
      <main className="main">
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
                      <InfoTip content="Alpha thinks with a model you connect: your Claude or ChatGPT account, an API key, or Ollama on this Mac." label="About connecting a model" />
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
              <Home client={runtime.client} version={version} onGo={setSurface} onChanged={changed} onAsk={ask} onNew={startNew} onOpenThread={(id) => { rememberSession(scopeKey, id); openAssistant(); }} />
            ) : surface.kind === "module" ? (
              <ModulePage
                key={surface.id}
                client={runtime.client}
                moduleId={surface.id}
                version={version}
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
              <People client={runtime.client} version={version} onOpen={(id) => setSurface({ kind: "entity", id })} />
            ) : surface.kind === "entity" ? (
              <EntityPage key={surface.id} client={runtime.client} id={surface.id} version={version} onBack={() => setSurface({ kind: "people" })} onOpen={(id) => setSurface({ kind: "entity", id })} onChanged={changed} />
            ) : surface.kind === "intelligence" ? (
              <Intelligence client={runtime.client} modules={modules} tab={(surface.tab ?? "brain") as IntelTab} version={version} onTab={(tab) => setSurface({ kind: "intelligence", tab })} onGo={setSurface} onChanged={changed} />
            ) : (
              <Activity client={runtime.client} version={version} onChanged={changed} />
            )}
          </>
        )}
      </main>
      {client && assistOpen ? (
        <div ref={assistRef} id="panel-right" className={narrow ? "assist assist--overlay" : "assist"} style={compact || narrow ? undefined : { width: assistantWidth }}>
          {!compact && !narrow ? <ResizeHandle side="right" onMouseDown={assistantPanel.startDrag} onStep={assistantPanel.resizeBy} label="Resize Chief of Staff" value={assistantWidth} min={260} max={520} isDragging={assistantPanel.isDragging} /> : null}
          <AssistantPanel
            client={client}
            onCollapse={closeAssistant}
            scopeName={scopeName}
            module={scopeModule}
            version={version}
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
                  panel={{ ...railPanel, collapsed: false, displayWidth: 280 }}
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
      {client ? <CommandMenu modules={modules} onGo={setSurface} onNew={startNew} onAsk={ask} /> : null}
    </div>
  );
}
