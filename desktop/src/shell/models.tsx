/**
 * Settings → Models: every way Zazoo can reach a model, one line each, laid out as on
 * feat/bridge-parity. Claude (Claude Code) and ChatGPT (Codex) are real: install, sign in, sign
 * out, the star for the way Zazoo thinks (PUT /api/thinking) and ChatGPT's model. The other rows,
 * their keys and Claude's model picker need the core's /api/models and /api/settings
 * (backend-requests.md §1), so using them says so.
 */
import { useEffect, useState } from "react";
import { MoreVertical, Star } from "lucide-react";
import type { Client, Thinking, ThinkRoute } from "../core/client";
import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, InfoTip, Input, StandardDropdown, Button, SoonBadge, useComingSoon } from "../ui";

type Kind = "sign_in" | "key" | "local";

// The providers and how each is reached, as in bridge-parity's core/alpha/models/accounts.py.
const PROVIDERS: { id: string; label: string; kind: Kind; how: string; transcribeOnly?: boolean }[] = [
  { id: "claude_api", label: "Claude API", kind: "key", how: "A key from console.anthropic.com. Billed per use." },
  { id: "chatgpt_api", label: "ChatGPT API", kind: "key", how: "A key from platform.openai.com. Billed per use." },
  { id: "openrouter", label: "OpenRouter", kind: "key", how: "A key from openrouter.ai: many models behind one key. No web search on this route." },
  { id: "grok", label: "Grok", kind: "key", how: "A key from console.x.ai. No web search on this route." },
  { id: "deepseek", label: "DeepSeek", kind: "key", how: "A key from platform.deepseek.com. No web search on this route." },
  { id: "ollama", label: "Ollama", kind: "local", how: "Models running on this Mac, free and private. Install Ollama from ollama.com and pull a model; it shows up here." },
  { id: "groq", label: "Groq", kind: "key", how: "A key from console.groq.com, used only to turn speech into text.", transcribeOnly: true },
];

const WAIT_EVERY_MS = 3000;

// The two ways Zazoo thinks, each through a tool on this Mac signed in to the person's plan.
const ACCOUNTS: Record<ThinkRoute, { label: string; tool: string; install: (c: Client) => Promise<unknown>; signIn: (c: Client) => Promise<unknown>; signOut: (c: Client) => Promise<unknown> }> = {
  claude: { label: "Claude", tool: "Claude Code", install: (c) => c.installClaude(), signIn: (c) => c.signInClaude(), signOut: (c) => c.signOutClaude() },
  codex: { label: "ChatGPT", tool: "Codex", install: (c) => c.installCodex(), signIn: (c) => c.signInCodex(), signOut: (c) => c.signOutCodex() },
};

/** Claude or ChatGPT: connected or not, the one step that gets there, the star that makes it the
 * way Zazoo thinks, and its model. */
function AccountRow({ client, route, thinking, onThinking }: { client: Client; route: ThinkRoute; thinking: Thinking | null; onThinking: (t: Thinking) => void }) {
  const soon = useComingSoon();
  const [waiting, setWaiting] = useState<"install" | "signin" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = ACCOUNTS[route];
  const status = thinking?.[route] ?? null;

  // While the installer runs or the person signs in in their browser, check until it's done.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      client
        .thinking()
        .then((t) => {
          onThinking(t);
          if ((waiting === "install" && t[route].installed) || (waiting === "signin" && t[route].signed_in)) setWaiting(null);
        })
        .catch(() => undefined);
    }, WAIT_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting, client, onThinking, route]);

  async function act(work: () => Promise<unknown>, next: "install" | "signin" | null) {
    setError(null);
    try {
      await work();
      setWaiting(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const refresh = () => client.thinking().then(onThinking);

  const connected = Boolean(status?.signed_in);
  const isDefault = thinking?.route === route;
  const codex = thinking?.codex;
  const words = !status
    ? "Checking…"
    : confirming
      ? isDefault
        ? "Zazoo can't think until you sign in again."
        : `Zazoo stops using ${account.label}.`
      : waiting === "install"
        ? `Installing ${account.tool}… this takes a minute.`
        : waiting === "signin"
          ? "Finish signing in in your browser."
          : connected
            ? [status.email, status.plan ? `${status.plan} plan` : null, `through ${account.tool} on this Mac`].filter(Boolean).join(" · ")
            : status.installed
              ? `Sign in with your ${account.label} account; your browser opens.`
              : `Zazoo thinks with ${account.tool}. Installing it takes a minute and needs no password.`;
  return (
    <div className={isDefault ? "item models__row models__row--default" : "item models__row"}>
      <IconButton
        size="sm"
        aria-label={isDefault ? `${account.label} is the default` : `Make ${account.label} the default`}
        aria-pressed={isDefault}
        title={isDefault ? "Default" : connected ? "Make default" : `Connect ${account.label} first`}
        disabled={!connected && !isDefault}
        onClick={() => (isDefault ? undefined : void act(() => client.setThinking(route).then(onThinking), null))}
      >
        <Star size={14} aria-hidden="true" className={isDefault ? "models__star models__star--on" : "models__star"} fill={isDefault ? "currentColor" : "none"} />
      </IconButton>
      <div className="item__body models__body">
        <b>{account.label}</b>
        <div className={`item__sub${confirming ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? (
          <div className="notice models__line" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <div className="models__controls">
        {connected && route === "claude" ? (
          <span className="models__picker">
            <StandardDropdown options={CLAUDE_MODELS} value={null} onChange={() => soon("Choosing Claude's model")} placeholder="Default model" ariaLabel="Claude model" />
          </span>
        ) : null}
        {connected && route === "codex" && codex?.models?.length ? (
          <span className="models__picker">
            <StandardDropdown
              options={codex.models.map((m) => ({ value: m.id, label: m.name }))}
              value={codex.model ?? null}
              onChange={(model) => void act(() => client.setCodexModel(model).then(onThinking), null)}
              placeholder="Default model"
              ariaLabel="ChatGPT model"
            />
          </span>
        ) : null}
        {isDefault ? <Badge variant="warning">Default</Badge> : null}
        {status ? <Badge variant={connected ? "success" : "warning"}>{connected ? "Connected" : "Not connected"}</Badge> : null}
        {!status ? null : connected ? (
          confirming ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void act(() => account.signOut(client).then(refresh), null).then(() => setConfirming(false))}>
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Sign out
            </Button>
          )
        ) : status.installed ? (
          <Button size="sm" disabled={waiting !== null} onClick={() => void act(() => account.signIn(client), "signin")}>
            {waiting === "signin" ? "Waiting…" : "Sign in"}
          </Button>
        ) : (
          <Button size="sm" disabled={waiting !== null} onClick={() => void act(() => account.install(client), "install")}>
            {waiting === "install" ? "Installing…" : "Install"}
          </Button>
        )}
      </div>
    </div>
  );
}

export const CLAUDE_MODELS = [
  { value: "opus", label: "Claude Opus" },
  { value: "sonnet", label: "Claude Sonnet" },
  { value: "haiku", label: "Claude Haiku" },
];

/** One provider that isn't wired yet: its name, the control that would connect it, its menu. */
function SoonProviderRow({ provider: p }: { provider: (typeof PROVIDERS)[number] }) {
  const soon = useComingSoon();
  const [draft, setDraft] = useState("");
  const saveKey = () => {
    if (!draft.trim()) return;
    setDraft("");
    soon(`Saving a ${p.label} key`);
  };
  return (
    <div className="item models__row">
      {p.transcribeOnly ? (
        <span className="models__nostar" aria-hidden="true" />
      ) : (
        <IconButton size="sm" aria-label={`Make ${p.label} the default`} aria-pressed={false} title="Make default" onClick={() => soon("Choosing the default model")}>
          <Star size={14} aria-hidden="true" className="models__star" fill="none" />
        </IconButton>
      )}
      <div className="item__body models__body">
        <span className="models__name">
          <b className="models__label">{p.label}</b>
          <InfoTip content={p.how} label={`About ${p.label}`} />
          <SoonBadge />
        </span>
      </div>
      <div className="models__controls">
        {p.kind === "sign_in" ? (
          <Button size="sm" onClick={() => soon(`Connecting ${p.label}`)}>
            Connect
          </Button>
        ) : null}
        {p.kind === "key" ? (
          <>
            <Input type="password" className="models__field" placeholder="Paste a key" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveKey()} aria-label={`${p.label} key`} autoComplete="off" spellCheck={false} />
            {draft.trim() ? (
              <Button size="sm" onClick={saveKey}>
                Save
              </Button>
            ) : null}
          </>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" aria-label={`${p.label} options`}>
              <MoreVertical size={14} aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => soon(`Testing ${p.label}`)}>Test</DropdownMenuItem>
            {p.kind !== "local" ? <DropdownMenuItem onSelect={() => soon(`Reconnecting ${p.label}`)}>Reconnect</DropdownMenuItem> : null}
            {p.kind === "key" ? (
              <DropdownMenuItem className="ui-menu__item--danger" onSelect={() => soon(`Removing a ${p.label} key`)}>
                Remove key
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Settings → Models: Claude and ChatGPT (real), then the rest. */
export function Models({ client, thinking, onThinking }: { client: Client; thinking: Thinking | null; onThinking: (t: Thinking) => void }) {
  return (
    <div className="card list models" aria-label="Models">
      <AccountRow client={client} route="claude" thinking={thinking} onThinking={onThinking} />
      <AccountRow client={client} route="codex" thinking={thinking} onThinking={onThinking} />
      {PROVIDERS.map((p) => (
        <SoonProviderRow key={p.id} provider={p} />
      ))}
    </div>
  );
}
