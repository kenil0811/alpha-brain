/**
 * Settings -> Models: every way Alpha can reach a model, one line each. The star picks the
 * default (one row is always starred); a connected row shows its model. Rows with a problem come
 * first, then connected ones, then the rest. The same row, alone, is the card the conversation
 * shows when a message goes to a model that isn't connected: it starts connecting by itself and
 * the message goes again once it is.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MoreVertical, Star } from "lucide-react";
import type { Client, ModelProvider, ProviderModel } from "../core/client";
import { when } from "../modules/format";
import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, InfoTip, StandardDropdown, useOptionalToast } from "../ui";

const POLL_MS = 3000;
const DOT_ORDER = { red: 0, green: 1, grey: 2 } as const;

const HOW: Record<string, string> = {
  claude: "Your Claude plan, through Claude Code on this Mac. Sign in opens your browser; paste the code it shows.",
  claude_api: "A key from console.anthropic.com. Billed per use.",
  chatgpt: "Your ChatGPT plan, through Codex on this Mac. Sign in opens your browser.",
  chatgpt_api: "A key from platform.openai.com. Billed per use.",
  openrouter: "A key from openrouter.ai: many models behind one key. No web search on this route.",
  grok: "A key from console.x.ai. No web search on this route.",
  deepseek: "A key from platform.deepseek.com. No web search on this route.",
  ollama: "Models running on this Mac, free and private. Install Ollama from ollama.com and pull a model; it shows up here.",
  groq: "A key from console.groq.com, used only to turn speech into text.",
};

const GIVE_UP_NOTE = "Sign-in didn't finish. Try again when you're ready.";

/** The line under a connected sign-in row: who, and when a call last worked. */
function connectedLine(p: ModelProvider): string | null {
  if (p.state !== "connected") return null;
  const last = p.last_ok ? `last call ${when(p.last_ok.at)}` : null;
  if (p.who) return last ? `Signed in as ${p.who} · ${last}` : `Signed in as ${p.who}`;
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : null;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function byStatus(rows: ModelProvider[]): ModelProvider[] {
  return [...rows].sort((a, b) => DOT_ORDER[a.dot.color] - DOT_ORDER[b.dot.color]);
}

/** A connected row's model, saved per provider. Hidden when it lists none. */
export function ProviderModelPicker({ client, provider, label }: { client: Client; provider: string; label: string }) {
  const [page, setPage] = useState<{ models: ProviderModel[]; selected: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .providerModels(provider)
      .then((p) => live && setPage(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, provider]);
  if (!page?.models.length) return null;
  const choose = (model: string) => {
    const before = page.selected;
    setPage({ ...page, selected: model });
    setProblem(null);
    client.setProviderModel(provider, model).catch((e: unknown) => {
      setPage((p) => (p ? { ...p, selected: before } : p));
      setProblem(message(e));
    });
  };
  return (
    <span className="models__picker" title={problem ?? undefined}>
      <StandardDropdown options={page.models.map((m) => ({ value: m.id, label: m.label }))} value={page.selected} onChange={choose} placeholder="Default model" ariaLabel={`${label} model`} />
    </span>
  );
}

type Waiting = "sign_in" | "install" | null;

/** One provider: its dot, name and the one control that gets it connected. */
export function ProviderRow({
  client,
  provider: p,
  onChange,
  onStar,
  autoConnect = false,
  onConnected,
}: {
  client: Client;
  provider: ModelProvider;
  onChange: (next: ModelProvider) => void;
  onStar?: () => void;
  /** The conversation's card: start connecting at once. */
  autoConnect?: boolean;
  onConnected?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<Waiting>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const started = useRef(false);
  const keyField = useRef<HTMLInputElement>(null);
  const connected = p.state === "connected";
  const toast = useOptionalToast();

  const act = useCallback(
    async (work: () => Promise<ModelProvider | void>) => {
      setBusy(true);
      setProblem(null);
      try {
        const next = await work();
        if (next) onChange(next);
        return next;
      } catch (e) {
        setProblem(message(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  const signIn = useCallback(async () => {
    setNote(null);
    const next = await act(() => client.signInProvider(p.id));
    if (!next) return;
    if (next.needs_code) setCode("");
    else setWaiting("sign_in");
  }, [act, client, p.id]);

  const install = useCallback(async () => {
    const next = await act(() => client.installProvider(p.id));
    if (!next) return;
    if (next.state === "needs_sign_in") void signIn();
    else setWaiting("install");
  }, [act, client, p.id, signIn]);

  const connect = useCallback(() => {
    if (p.kind === "key") keyField.current?.focus();
    else if (p.kind === "local") void act(() => client.testProvider(p.id));
    else if ((p.state === "cli_missing" && p.id !== "claude") || p.state === "cli_too_old") void install();
    else void signIn();
  }, [p.kind, p.state, p.id, act, client, install, signIn]);

  useEffect(() => {
    if (!autoConnect || started.current || connected) return;
    started.current = true;
    connect();
  }, [autoConnect, connected, connect]);

  // While a browser sign-in or an install is under way, look again until it lands.
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      void client
        .modelProviders()
        .then((rows) => {
          const row = rows.find((r) => r.id === p.id);
          if (!row) return;
          onChange(row);
          if (row.state === "connected") setWaiting(null);
          else if (waiting === "install" && row.state === "needs_sign_in" && !row.installing) {
            setWaiting(null);
            void signIn();
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    const stop = window.setTimeout(() => {
      setWaiting(null);
      if (waiting === "sign_in") setNote(GIVE_UP_NOTE);
    }, 5 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [waiting, client, p.id, onChange, signIn]);

  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) {
      if (p.kind === "sign_in") toast?.show(`${p.label}: signed in.`);
      onConnected?.();
    }
    wasConnected.current = connected;
  }, [connected, onConnected, p.kind, p.label, toast]);

  const saveKey = () => {
    const key = draft.trim();
    if (!key) return;
    void act(() => client.saveProviderKey(p.id, key)).then((next) => {
      if (!next) return;
      setDraft("");
      toast?.show(`${p.label}: key saved.`);
    });
  };
  const sendCode = () => {
    if (!code?.trim()) return;
    void act(() => client.finishProviderSignIn(p.id, code.trim())).then((next) => next && setCode(null));
  };
  const reconnect = async () => {
    const next = await act(() => client.reconnectProvider(p.id));
    if (!next) return;
    toast?.show(`${p.label}: disconnected. Connect again to carry on.`);
    if (p.kind === "sign_in") void signIn();
    else if (p.kind === "key") {
      setNote("Paste a new key.");
      window.setTimeout(() => keyField.current?.focus(), 0);
    }
  };
  const check = async () => {
    setChecking(true);
    await act(() => client.testProvider(p.id));
    setChecking(false);
  };
  const removeKey = async () => {
    if (await act(() => client.removeProviderKey(p.id))) toast?.show(`${p.label}: key removed.`);
  };

  const installing = waiting === "install" || p.installing;
  const line =
    problem ??
    p.error ??
    (checking
      ? "Checking…"
      : installing
        ? "Installing…"
        : waiting === "sign_in"
          ? "Finish signing in in your browser."
          : code !== null
            ? "Approve in your browser, then paste the code it shows."
            : (note ?? (p.state === "cli_too_old" || p.install_failed ? (p.why ?? null) : (connectedLine(p) ?? (autoConnect && p.kind === "local" && !connected ? p.dot.tooltip : null)))));
  const isError = Boolean(problem ?? p.error) || (!checking && !installing && (p.state === "cli_too_old" || Boolean(p.install_failed)));
  const signInLabel =
    p.state === "cli_too_old"
      ? installing
        ? "Updating…"
        : "Update"
      : p.state === "cli_missing" && p.id !== "claude"
        ? installing
          ? "Installing…"
          : p.install_failed
            ? "Retry install"
            : "Install Codex"
        : waiting === "sign_in"
          ? "Open sign-in again"
          : p.id === "chatgpt"
            ? "Connect"
            : "Sign in";
  return (
    <div className={`item models__row${p.default ? " models__row--default" : ""}`}>
      {onStar && p.transcribe_only ? <span className="models__nostar" aria-hidden="true" /> : null}
      {onStar && !p.transcribe_only ? (
        <IconButton size="sm" label={p.default ? `${p.label} is the default` : `Make ${p.label} the default`} aria-pressed={p.default} title={p.default ? "Default" : "Make default"} onClick={() => !p.default && onStar()} icon={<Star aria-hidden="true" className={p.default ? "models__star models__star--on" : "models__star"} fill={p.default ? "currentColor" : "none"} />} />
      ) : null}
      <span className={`models__dot models__dot--${p.dot.color}`} role="img" aria-label={p.dot.tooltip} title={p.dot.tooltip} />
      <div className="item__body models__body">
        <span className="models__name">
          <b className="models__label" title={p.who ? `${p.label} · ${p.who}` : p.label}>
            {p.label}
          </b>
          {HOW[p.id] ? <InfoTip text={HOW[p.id]} /> : null}
          {p.default ? <Badge tone="warn">Default</Badge> : null}
        </span>
        {line ? (
          <div className={isError ? "notice models__line" : "item__sub models__line"} role={isError ? "alert" : "status"} title={line}>
            {line}
          </div>
        ) : null}
      </div>
      <div className="models__controls">
        {connected ? <ProviderModelPicker client={client} provider={p.id} label={p.label} /> : null}
        {code !== null ? (
          <>
            <input className="models__field" placeholder="Paste the code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCode()} aria-label={`${p.label} sign-in code`} autoFocus />
            <button type="button" className="btn btn--sm btn--primary" disabled={busy || !code.trim()} onClick={sendCode}>
              Connect
            </button>
          </>
        ) : p.kind === "sign_in" && !connected ? (
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || installing} onClick={waiting === "sign_in" ? () => void signIn() : connect}>
            {signInLabel}
          </button>
        ) : null}
        {p.kind === "key" ? (
          <>
            <input
              ref={keyField}
              type="password"
              className="models__field"
              placeholder={p.key_last4 ? `•••• ${p.key_last4}` : "Paste a key"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              aria-label={`${p.label} key`}
              autoComplete="off"
              spellCheck={false}
            />
            {draft.trim() ? (
              <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={saveKey}>
                {busy ? "Checking…" : "Save"}
              </button>
            ) : null}
          </>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" label={`${p.label} options`} disabled={busy} icon={<MoreVertical aria-hidden="true" />} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void check()}>Check again</DropdownMenuItem>
            {p.kind !== "local" ? <DropdownMenuItem onSelect={() => void reconnect()}>Reconnect</DropdownMenuItem> : null}
            {p.kind === "key" && p.key_last4 ? (
              <DropdownMenuItem className="ui-menu__item--danger" onSelect={() => void removeKey()}>
                Remove key
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Settings -> Models: every row, sorted by status, with the star. */
export function ProviderAccounts({ client }: { client: Client }) {
  const [rows, setRows] = useState<ModelProvider[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Sorted once per load, so a row doesn't jump while the person works on it.
  const [order, setOrder] = useState<string[]>([]);
  const toast = useOptionalToast();

  const load = useCallback(() => {
    client
      .modelProviders()
      .then((all) => {
        setRows(all);
        setOrder(byStatus(all).map((r) => r.id));
      })
      .catch((e: unknown) => setProblem(message(e)));
  }, [client]);
  useEffect(load, [load]);

  const update = useCallback((next: ModelProvider) => setRows((all) => all && all.map((r) => (r.id === next.id ? { ...next, default: r.default } : r))), []);
  const star = (id: string) => {
    const before = rows;
    setRows((all) => all && all.map((r) => ({ ...r, default: r.id === id })));
    client.starProvider(id).then((next) => {
      setRows(next);
      toast?.show(`${next.find((r) => r.id === id)?.label ?? id} is now the default.`);
    }, (e: unknown) => {
      setRows(before);
      setProblem(message(e));
    });
  };

  if (!rows) {
    return problem ? (
      <p className="notice" role="alert">
        {problem}
      </p>
    ) : null;
  }
  const sorted = order.map((id) => rows.find((r) => r.id === id)).filter((r): r is ModelProvider => Boolean(r));
  return (
    <div className="card list models" aria-label="Models">
      {problem ? (
        <p className="notice models__problem" role="alert">
          {problem}
        </p>
      ) : null}
      {sorted.map((p) => (
        <ProviderRow key={p.id} client={client} provider={p} onChange={update} onStar={() => star(p.id)} />
      ))}
    </div>
  );
}

/** Settings -> Models, from anywhere in the workspace (the address the rail reads). */
export function openModelSettings(): void {
  window.history.pushState(null, "", "#/settings/models");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** The conversation's card when a message goes to a model that isn't connected, before the call
 *  or because the call itself failed on the connection (after Alpha's NotConnectedCard): it
 *  connects by itself, and `onConnected` sends the message again. `kind` "generic" is a model
 *  that couldn't answer for another reason: the card offers Try again. */
export function ConnectCard({
  client,
  provider,
  onConnected,
  onCancel,
  kind = "sign_in",
  reason = null,
  inWorkspace = true,
}: {
  client: Client;
  provider: string;
  onConnected: () => void;
  onCancel: () => void;
  kind?: "sign_in" | "key" | "generic";
  reason?: string | null;
  /** The companion has no Settings to open. */
  inWorkspace?: boolean;
}) {
  const [row, setRow] = useState<ModelProvider | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const done = useRef(onConnected);
  done.current = onConnected;
  const connected = useCallback(() => done.current(), []);
  useEffect(() => {
    let live = true;
    client
      .modelProviders()
      .then((rows) => {
        const found = rows.find((r) => r.id === provider) ?? null;
        if (!live) return;
        if (found?.state === "connected" && kind !== "generic" && !found.error) connected();
        else setRow(found);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, provider, connected, kind]);
  if (!row) return null;
  const recheck = () => {
    setNote(null);
    client
      .testProvider(provider)
      .then((next) => {
        setRow(next);
        if (next.dot.color === "green") connected();
        else setNote(next.dot.tooltip);
      })
      .catch((e: unknown) => setNote(message(e)));
  };
  const why = reason?.replace(/^I can't reach (the|that) model( right now)?[:.]?\s*/i, "").trim();
  return (
    <div className="msg msg--ai models__connect" role="group" aria-label={`Connect ${row.label}`}>
      <div className="models__connect-head">
        <b>{kind === "generic" ? `${row.label} couldn't answer.` : `Not connected to ${row.label}.`}</b>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>
          Not now
        </button>
      </div>
      {why && !/^try again/i.test(why) ? (
        <div className="faint models__line" title={reason ?? undefined}>
          {why.charAt(0).toUpperCase() + why.slice(1)}
        </div>
      ) : null}
      {note ? <div className="faint models__line">{note}</div> : null}
      {kind === "generic" ? null : (
        <div className="list">
          <ProviderRow client={client} provider={row} onChange={setRow} autoConnect onConnected={connected} />
        </div>
      )}
      <div className="row models__connect-actions">
        {kind === "generic" ? (
          <button type="button" className="btn btn--sm" onClick={connected}>
            Try again
          </button>
        ) : row.kind === "sign_in" ? (
          <button type="button" className="btn btn--sm" onClick={recheck}>
            I've signed in
          </button>
        ) : null}
        {inWorkspace ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={openModelSettings}>
            Open Settings → Models
          </button>
        ) : null}
      </div>
    </div>
  );
}
