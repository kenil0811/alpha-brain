import { Ban, Bot, CircleCheck, FileText, Plus, Upload, Zap } from "lucide-react";
import { useState } from "react";
import { Button, Card, Disabled, Switch } from "../kit";
import { go, href } from "../data/route";
import type { Project } from "../data/types";
import { DataView } from "./DataView";
import { RecordPage } from "./RecordPage";

export function PageHeader({ children }: { children: React.ReactNode }) {
  return <header className="pagehead">{children}</header>;
}

/** One layout for every table page: the data over the first screen, then Files, Intelligence
 *  and Governance below the fold (fixed rule 26). */
export function ProjectPage({ project, collection, record, fresh }: { project: Project; collection?: string; record?: string; fresh?: boolean }) {
  const coll = project.collections.find((c) => c.id === collection) ?? project.collections[0];
  const tabs = project.collections.map((c) => ({ id: c.id, label: c.label, icon: c.icon }));
  return (
    <>
      <PageHeader>
        {tabs.length > 1 ? (
          <Switch tabs={tabs} active={coll.id} onPick={(id) => go(href.project(project.id, id))} />
        ) : (
          <h1 className="pagehead__title">{project.name}</h1>
        )}
      </PageHeader>
      <div className="main__body">
        {record ? (
          <RecordPage key={record} project={project} coll={coll} id={record} fresh={fresh} />
        ) : (
          <>
            <div className="firstscreen">
              <DataView key={coll.id} project={project} coll={coll} />
            </div>
            <BelowFold project={project} />
          </>
        )}
      </div>
    </>
  );
}

function BelowFold({ project }: { project: Project }) {
  const [tab, setTab] = useState<"allowed" | "denied">("allowed");
  return (
    <div className="below">
      <Card title="Files" icon={FileText} actions={<Disabled reason="Uploads are off in this demo"><Button icon={Upload} disabled>Upload</Button></Disabled>} info="Files Alpha makes here (reports, drafts, summaries) are saved with a clear name and listed here.">
        {project.files.length ? (
          <ul className="files">
            {project.files.map((f) => (
              <li key={f.name}>
                <FileText aria-hidden />
                <span className="files__name">{f.name}</span>
                <span className="meta">{f.by} · {f.when} · {f.size}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No files are attached yet.</p>
        )}
      </Card>

      <Card title="Intelligence" icon={Bot} info="What Alpha does in this project: its agents and automations, and Alpha's page about it.">
        <p className="about">{project.about}</p>
        <div className="intel">
          {project.agents.map((a) => (
            <a key={a.id} className="intel__row" href={href.intelligence("agents", a.id)}>
              <Bot aria-hidden />
              <span className="intel__name">{a.name}</span>
              <span className="intel__desc">{a.does}</span>
            </a>
          ))}
          {project.automations.map((a) => (
            <a key={a.id} className="intel__row" href={href.intelligence("automations", a.id)}>
              <Zap aria-hidden />
              <span className="intel__name">{a.sentence}</span>
              <span className="intel__desc">Next: {a.next}</span>
            </a>
          ))}
        </div>
        <div className="row-actions">
          <Disabled reason="Agents are fixed in this demo"><Button icon={Plus} disabled>Add agent</Button></Disabled>
          <Disabled reason="Automations are fixed in this demo"><Button icon={Plus} disabled>Add automation</Button></Disabled>
        </div>
      </Card>

      <Card title="Governance" icon={CircleCheck} info="Where this data lives and what Alpha may do with it.">
        <div className="gov__tabs" role="tablist">
          <button role="tab" aria-selected={tab === "allowed"} className={tab === "allowed" ? "gov__tab gov__tab--on" : "gov__tab"} onClick={() => setTab("allowed")}>
            <CircleCheck aria-hidden /> Allowed {project.allowed.length}
          </button>
          <button role="tab" aria-selected={tab === "denied"} className={tab === "denied" ? "gov__tab gov__tab--on" : "gov__tab"} onClick={() => setTab("denied")}>
            <Ban aria-hidden /> Denied {project.denied.length}
          </button>
        </div>
        <ul className="rules">
          {(tab === "allowed" ? project.allowed : project.denied).map((r) => (
            <li key={r.text}><span className="rules__text">{r.text}</span><span className="rules__why">{r.why}</span></li>
          ))}
        </ul>
        <h3 className="subhead">Where things are kept</h3>
        <dl className="kv">
          {project.kept.map((k) => (
            <div key={k.what} className="kv__row"><dt>{k.what}</dt><dd>{k.where}</dd></div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
