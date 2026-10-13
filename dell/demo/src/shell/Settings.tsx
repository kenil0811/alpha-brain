import { Bell, Building2, Database, Palette, Shield, Sparkles, Users, Settings as Cog, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button, Card, Confirm, Dropdown, Flash, Pill, useFlash } from "../kit";
import { href } from "../data/route";
import { ROLE_LABEL, ROLE_PERSON, useWorld } from "../data/store";
import type { Role } from "../data/types";
import { PageHeader } from "../views/ProjectPage";
import { useTheme } from "./theme";

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Cog },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "team", label: "Team and roles", icon: Users },
  { id: "thinks", label: "Thinks with", icon: Sparkles },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Your data", icon: Database },
];

export function Settings({ section }: { section: string }) {
  const show = (id: string) => section === "overview" || section === id;
  return (
    <>
      <PageHeader><h1 className="pagehead__title">Settings</h1></PageHeader>
      <div className="main__body">
        <div className="settings">
          <nav className="settings__nav" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={href.settings(s.id)} className={["settings__item", section === s.id && "settings__item--on"].filter(Boolean).join(" ")} aria-current={section === s.id ? "page" : undefined}>
                <s.icon aria-hidden />{s.label}
              </a>
            ))}
          </nav>
          <div className="settings__body">
            {show("workspace") ? <Workspace /> : null}
            {show("team") ? <Team /> : null}
            {show("thinks") ? <Thinks /> : null}
            {show("appearance") ? <Appearance /> : null}
            {show("notifications") ? (
              <Card title="Notifications">
                <div className="dashed">Nothing configured yet. Choices about what may interrupt staff, and when, will appear here.</div>
              </Card>
            ) : null}
            {show("security") ? <Security /> : null}
            {show("data") ? <Data /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Workspace() {
  return (
    <Card title="Workspace">
      <dl className="kv">
        <div className="kv__row"><dt>Name</dt><dd>Dell Disability Lawyers</dd></div>
        <div className="kv__row"><dt>Brands</dt><dd>Two marketed firm names share this workspace; reporting is combined, forms and sender identities stay separate.</dd></div>
      </dl>
    </Card>
  );
}

function Team() {
  const w = useWorld();
  return (
    <Card title="Team and roles" info="Staff sign in with their Microsoft 365 accounts. A role decides what each person sees; matter access narrows it further.">
      <ul className="rows">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <li key={r} className="rows__row">
            <Users aria-hidden className="rows__ico" />
            <span className="rows__title">{ROLE_PERSON[r]}</span>
            <span className="rows__desc">{ROLE_LABEL[r]}</span>
            {r === w.role ? <Pill tone="blue">Viewing as</Pill> : <Button onClick={() => w.setRole(r)}>View as</Button>}
          </li>
        ))}
        <li className="rows__row">
          <Sparkles aria-hidden className="rows__ico" />
          <span className="rows__title">Alpha</span>
          <span className="rows__desc">AI worker · reads, drafts and proposes; never sends, files below threshold or moves money on its own</span>
          <Pill tone="gray">Service account</Pill>
        </li>
      </ul>
    </Card>
  );
}

function Thinks() {
  return (
    <Card title="Thinks with">
      <dl className="kv">
        <div className="kv__row"><dt>Model route</dt><dd>Claude through the firm's business API, covered by a business associate agreement (planned)</dd></div>
        <div className="kv__row"><dt>Connected</dt><dd><Pill tone="gray">Demo — no model is called</Pill></dd></div>
        <div className="kv__row"><dt>Web search</dt><dd>Off for client data</dd></div>
      </dl>
    </Card>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const [flash, setFlash] = useFlash();
  const label = { system: "Match Mac", light: "Light", dark: "Dark" }[theme];
  return (
    <Card title="Appearance" actions={<Flash msg={flash} />}>
      <div className="kv__row">
        <dt>Theme</dt>
        <dd>
          <Dropdown
            value={theme}
            options={[{ value: "system", label: "Match Mac" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            onChange={(v) => { setTheme(v as never); setFlash(`Theme: ${{ system: "Match Mac", light: "Light", dark: "Dark" }[v as "system"]}`); }}
            addLabel="Add theme…"
            trigger={<button className="tb"><span className="tb__label">{label}</span></button>}
          />
        </dd>
      </div>
    </Card>
  );
}

function Security() {
  return (
    <Card title="Security">
      <dl className="kv">
        <div className="kv__row"><dt>Staff sign-in</dt><dd>Microsoft 365 (Entra ID) with multi-factor authentication</dd></div>
        <div className="kv__row"><dt>Client sign-in</dt><dd>Separate portal accounts</dd></div>
        <div className="kv__row"><dt>Matter access</dt><dd>Least privilege per matter; duplicate alerts never reveal privileged details</dd></div>
        <div className="kv__row"><dt>Audit</dt><dd>Every change records who made it; merges, assignments, overrides and activations are permanent entries</dd></div>
      </dl>
    </Card>
  );
}

function Data() {
  const w = useWorld();
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useFlash();
  return (
    <Card title="Your data" actions={<Flash msg={flash} />}>
      <dl className="kv">
        <div className="kv__row"><dt>Where it lives</dt><dd>In this browser tab only, for the demo. Nothing is sent anywhere.</dd></div>
        <div className="kv__row"><dt>Sample data</dt><dd><Button onClick={() => setConfirm(true)}>Reset demo data</Button></dd></div>
      </dl>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset the demo data?"
        body="Every edit, approval and deletion made in this visit is undone, and the sample data returns to how it started."
        action="Reset"
        onConfirm={() => { w.reset(); setFlash("Demo data reset"); }}
      />
    </Card>
  );
}
