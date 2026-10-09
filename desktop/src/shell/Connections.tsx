/**
 * Intelligence › Connections: every folder, site and calendar Alpha can reach, with its state,
 * and the three ways to add one. Deleting one is never a single click: the menu opens a dialog
 * that says what goes with it before the person confirms (the UI rulebook §12 and §14).
 * Rows share the Automations and Skills layout (`ListRow`). (9 Oct, the pages phase.)
 */
import { type FormEvent, type ReactNode, useState } from "react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, Confirm, EmptyCard, IconButton, ListRow, Menu, MenuItem, Notice, SectionCard, type Tone } from "../ui";
import { Calendar, ConnectionIcon, FolderOpen, Globe, ICON, MoreHorizontal } from "../ui/icons";

const CONNECTOR: Record<string, { icon: ReactNode; label: (c: Connection) => string; reach: string }> = {
  files: { icon: <FolderOpen size={ICON} />, label: (c) => c.target.split("/").slice(-2).join("/"), reach: "Reads the documents in this folder as they change; never changes your files" },
  browser: { icon: <Globe size={ICON} />, label: (c) => `${c.target}, signed in as you`, reach: "Reads pages the way you would; never posts, messages or clicks" },
  calendar: { icon: <Calendar size={ICON} />, label: () => "Your calendars", reach: "Reads events and attendees; adds nothing without a yes" },
};

const STATUS: Record<Connection["status"], { tone: Tone; words: string }> = {
  connected: { tone: "good", words: "Working" },
  needs_ok: { tone: "warn", words: "Needs your sign-in" },
  broken: { tone: "bad", words: "Being repaired" },
  off: { tone: "gray", words: "Off" },
};

/** What deleting a connection takes with it: the same words Activity records afterwards. */
function removalWords(plan: ConnectionRemoval): string {
  return `This deletes ${plan.what}. ${plan.connector === "files" ? "Your files stay." : "Your tables keep their records."}`;
}

export function Connections({ client, data, onChanged }: { client: Client; data: Data; onChanged: () => void }) {
  const [folder, setFolder] = useState("");
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; plan: ConnectionRemoval | null } | null>(null);
  function askRemove(id: string) {
    setRemoving({ id, plan: null });
    client
      .connectionRemoval(id)
      .then((plan) => setRemoving((r) => (r?.id === id ? { id, plan } : r)))
      .catch((e: unknown) => {
        setRemoving(null);
        setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
      });
  }
  async function run(label: string, work: () => Promise<unknown>, ok: string) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  const live = data.connections.filter((c) => c.status !== "off");
  const hasCalendar = live.some((c) => c.connector === "calendar");
  const target = removing ? live.find((c) => c.id === removing.id) : undefined;
  return (
    <div className="stack stack--wide">
      {live.length ? (
        <div className="card lrows">
          {live.map((c) => {
            const meta = CONNECTOR[c.connector] ?? { icon: <ConnectionIcon size={ICON} />, label: () => c.target, reach: "" };
            return (
              <ListRow
                key={c.id}
                icon={meta.icon}
                title={meta.label(c)}
                description={
                  <>
                    {meta.reach}
                    {c.last_sync ? ` · last read ${when(c.last_sync)}` : ""}
                    {c.last_error ? ` · ${c.last_error}` : ""}
                  </>
                }
                controls={
                  <>
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].words}</Badge>
                    <Button size="sm" disabled={busy !== null} onClick={() => void run(c.id, () => client.syncConnection(c.id), "Read again.")}>
                      {c.connector === "browser" ? "Check" : "Read now"}
                    </Button>
                    <Menu trigger={<IconButton size="sm" label={`More for ${meta.label(c)}`} icon={<MoreHorizontal size={ICON} />} />}>
                      <MenuItem danger onSelect={() => askRemove(c.id)}>
                        Delete connection…
                      </MenuItem>
                    </Menu>
                  </>
                }
              />
            );
          })}
        </div>
      ) : (
        <EmptyCard icon={<ConnectionIcon size={ICON} />} title="Nothing connected yet">Alpha can always read public web pages; connect a folder, a site you sign into, or your calendar below.</EmptyCard>
      )}
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
      <Confirm
        open={Boolean(removing)}
        title="Delete this connection?"
        action="Delete connection"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing?.plan) return;
          const id = removing.id;
          void run(id, () => client.removeConnection(id), "Deleted.").then(() => setRemoving(null));
        }}
      >
        <p>{target ? <b>{CONNECTOR[target.connector]?.label(target) ?? target.target}</b> : null}</p>
        <p>{removing?.plan ? removalWords(removing.plan) : "Checking what goes with it…"}</p>
      </Confirm>
      <div className="addgrid">
        <SectionCard title="A folder" subtitle="Alpha reads what is in it and keeps up.">
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("folder", () => client.connectFolder(folder.trim()), "Alpha is reading the folder."); }}>
            <input className="textfield" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <Button variant="primary" type="submit" disabled={!folder.trim() || busy !== null}>
              Read it
            </Button>
          </form>
        </SectionCard>
        <SectionCard title="A site you sign into" subtitle="A window opens; you sign in yourself.">
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
            <input className="textfield" value={site} onChange={(e) => setSite(e.target.value)} placeholder="linkedin.com" aria-label="Site" />
            <Button variant="primary" type="submit" disabled={!site.trim() || busy !== null}>
              Sign in
            </Button>
          </form>
        </SectionCard>
        {!hasCalendar ? (
          <SectionCard title="Your calendar" subtitle="Every calendar in macOS Calendar.">
            <Button variant="primary" disabled={busy !== null} onClick={() => void run("calendar", () => client.connectCalendar(), "Calendars connected.")}>
              Connect calendars
            </Button>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
