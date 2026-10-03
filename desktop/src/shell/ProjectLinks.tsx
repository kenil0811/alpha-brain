/** Connections between projects (Alpha's ModuleLinks): which project reads which, switchable in place. */
import { useEffect, useState } from "react";
import type { Client, ModuleCard, ProjectLink } from "../core/client";
import { ModuleIcon } from "../ui/ModuleIcon";
import { projectIcon } from "./projectIcons";
import "../dataviews/dataviews.css";

export function ProjectLinks({ client, modules, version, onOpenModule }: { client: Client; modules: ModuleCard[]; version: number; onOpenModule: (id: string) => void }) {
  const [rows, setRows] = useState<ProjectLink[] | null>(null);
  useEffect(() => {
    client
      .projectLinks()
      .then(setRows)
      .catch(() => setRows([]));
  }, [client, version]);
  const icon = (id: string) => {
    const m = modules.find((x) => x.id === id);
    return m ? projectIcon(m) : undefined;
  };
  if (rows === null) return <p className="faint">Loading…</p>;
  if (!rows.length) return <p className="empty">No project reads another yet.</p>;
  return (
    <div className="card tablewrap">
      <table className="table table--wrap" aria-label="Project connections">
        <thead>
          <tr>
            <th>Project</th>
            <th>Reads</th>
            <th>Why</th>
            <th>On</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((link) => (
            <tr key={`${link.module}:${link.reads}`}>
              <td>
                <button type="button" className="linklike" onClick={() => onOpenModule(link.module)}>
                  <ModuleIcon icon={icon(link.module)} /> {link.name}
                </button>
              </td>
              <td title={link.tables.join(", ")}>
                {link.reads_name}
                <span className="faint"> · {link.tables.join(", ")}</span>
              </td>
              <td title={link.why}>{link.why}</td>
              <td>
                <button
                  type="button"
                  className={`switch${link.enabled ? "" : " switch--off"}`}
                  role="switch"
                  aria-checked={link.enabled}
                  aria-label={`${link.name} reads ${link.reads_name}`}
                  onClick={() => void client.setProjectLink(link.module, link.reads, !link.enabled).then(setRows).catch(() => undefined)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
