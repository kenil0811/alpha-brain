/**
 * Settings → Models: every way Alpha can reach a model, one line each, laid out as on
 * feat/bridge-parity. Only Claude Code is wired today (main's ClaudeRow, which also signs in from
 * the first-run card). The other rows, their keys, the star for the default and the model
 * picker need the core's /api/models and /api/settings (backend-requests.md §1), so using
 * them says so.
 */
import { type ReactNode, useEffect, useState } from "react";
import { MoreVertical, Star } from "lucide-react";
import type { ClaudeStatus, Client } from "../core/client";
import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, InfoTip, Input, StandardDropdown, Button, SoonBadge, useComingSoon } from "../ui";

type Kind = "sign_in" | "key" | "local";

// The providers and how each is reached, as in bridge-parity's core/alpha/models/accounts.py.
const PROVIDERS: { id: string; label: string; kind: Kind; how: string; transcribeOnly?: boolean }[] = [
  { id: "claude_api", label: "Claude API", kind: "key", how: "A key from console.anthropic.com. Billed per use." },
  { id: "chatgpt", label: "ChatGPT", kind: "sign_in", how: "Your ChatGPT plan, through Codex on this Mac. Sign in opens your browser." },
  { id: "chatgpt_api", label: "ChatGPT API", kind: "key", how: "A key from platform.openai.com. Billed per use." },
  { id: "openrouter", label: "OpenRouter", kind: "key", how: "A key from openrouter.ai: many models behind one key. No web search on this route." },
  { id: "grok", label: "Grok", kind: "key", how: "A key from console.x.ai. No web search on this route." },
  { id: "deepseek", label: "DeepSeek", kind: "key", how: "A key from platform.deepseek.com. No web search on this route." },
  { id: "ollama", label: "Ollama", kind: "local", how: "Models running on this Mac, free and private. Install Ollama from ollama.com and pull a model; it shows up here." },
  { id: "groq", label: "Groq", kind: "key", how: "A key from console.groq.com, used only to turn speech into text.", transcribeOnly: true },
];

const WAIT_EVERY_MS = 3000;

/** Claude: connected or not, and the one step that gets there. Also used on first run. */
export function ClaudeRow({ client, status, onStatus, star, children }: { client: Client; status: ClaudeStatus | null; onStatus: (s: ClaudeStatus) => void; star?: ReactNode; children?: ReactNode }) {
  const [waiting, setWaiting] = useState<"install" | "signin" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While the installer runs or the person signs in in their browser, check until it's done.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      client
        .claude()
        .then((s) => {
          onStatus(s);
          if ((waiting === "install" && s.installed) || (waiting === "signin" && s.signed_in)) setWaiting(null);
        })
        .catch(() => undefined);
    }, WAIT_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting, client, onStatus]);

  async function act(work: () => Promise<unknown>, next: "install" | "signin" | null) {
    setError(null);
    try {
      await work();
      setWaiting(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const connected = Boolean(status?.signed_in);
  const words = !status
    ? "Checking…"
    : confirming
      ? "Alpha can't think until you sign in again."
      : waiting === "install"
        ? "Installing Claude Code… this takes a minute."
        : waiting === "signin"
          ? "Finish signing in in your browser."
          : connected
            ? [status.email, status.plan ? `${status.plan} plan` : null, "through Claude Code on this Mac"].filter(Boolean).join(" · ")
            : status.installed
              ? "Sign in with your Claude account; your browser opens."
              : "Alpha thinks with Claude Code. Installing it takes a minute and needs no password.";
  return (
    <div className={star ? "item models__row models__row--default" : "item"}>
      {star}
      <div className="item__ico" aria-hidden="true">
        ✳
      </div>
      <div className={star ? "item__body models__body" : "item__body"}>
        <b>Claude</b>
        <div className={`item__sub${confirming ? " item__sub--warn" : ""}`}>{words}</div>
        {error ? <div className="notice" style={{ fontSize: 12 }}>{error}</div> : null}
      </div>
      <div className="models__controls">
        {children}
        {status ? <Badge variant={connected ? "success" : "warning"}>{connected ? "Connected" : "Not connected"}</Badge> : null}
        {!status ? null : connected ? (
          confirming ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void act(() => client.signOutClaude().then(onStatus), null).then(() => setConfirming(false))}>
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Sign out
            </Button>
          )
        ) : status.installed ? (
          <Button size="sm" disabled={waiting !== null} onClick={() => void act(() => client.signInClaude(), "signin")}>
            {waiting === "signin" ? "Waiting…" : "Sign in"}
          </Button>
        ) : (
          <Button size="sm" disabled={waiting !== null} onClick={() => void act(() => client.installClaude(), "install")}>
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

/** Settings → Models: Claude (real, and the default), then the rest. */
export function Models({ client, claude, onClaude }: { client: Client; claude: ClaudeStatus | null; onClaude: (s: ClaudeStatus) => void }) {
  const soon = useComingSoon();
  return (
    <div className="card list models" aria-label="Models">
      <ClaudeRow
        client={client}
        status={claude}
        onStatus={onClaude}
        star={
          <IconButton size="sm" aria-label="Claude is the default" aria-pressed title="Default">
            <Star size={14} aria-hidden="true" className="models__star models__star--on" fill="currentColor" />
          </IconButton>
        }
      >
        {claude?.signed_in ? (
          <span className="models__picker">
            <StandardDropdown options={CLAUDE_MODELS} value={null} onChange={() => soon("Choosing Claude's model")} placeholder="Default model" ariaLabel="Claude model" />
          </span>
        ) : null}
        <Badge variant="warning">Default</Badge>
      </ClaudeRow>
      {PROVIDERS.map((p) => (
        <SoonProviderRow key={p.id} provider={p} />
      ))}
    </div>
  );
}
