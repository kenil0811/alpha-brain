import * as RMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronRight, Home, Plus, Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { Tip } from "../kit";
import { href, type Route } from "../data/route";
import { ROLE_LABEL, ROLE_PERSON, useWorld } from "../data/store";
import type { Role } from "../data/types";
import { PROJECTS } from "../projects/registry";

/** The sidebar (rulebook §4): workspace, Home, projects (children fold out), New project; then
 *  Intelligence and Settings pinned at the bottom, Settings always last. */
export function Sidebar({ route, folded }: { route: Route; folded: boolean }) {
  const w = useWorld();
  const needs = w.proposals.filter((p) => p.state === "open" && p.roles.includes(w.role)).length;
  const [open, setOpen] = useState<Record<string, boolean>>({ benefits: true });
  const top = PROJECTS.filter((p) => !p.parent);
  const activeProject = route.page === "project" ? route.project : null;

  const item = (id: string, label: string, Icon: typeof Home, to: string, active: boolean, extra?: React.ReactNode, depth = 0) => {
    const link = (
      <a
        key={id}
        href={to}
        className={["navitem", active && "navitem--on", depth && "navitem--child"].filter(Boolean).join(" ")}
        aria-current={active ? "page" : undefined}
        aria-label={folded ? label : undefined}
      >
        <Icon className="navitem__ico" aria-hidden />
        <span className="navitem__label">{label}</span>
        {extra}
      </a>
    );
    return folded ? <Tip key={id} text={label} side="right">{link}</Tip> : link;
  };

  return (
    <nav className="sidebar" aria-label="Sidebar">
      <RMenu.Root modal={false}>
        <RMenu.Trigger asChild>
          <button className="workspace" aria-label="Workspace menu">
            <span className="workspace__tile">D</span>
            <span className="workspace__text">
              <span className="workspace__name">Dell Disability Lawyers</span>
              <span className="workspace__role">{ROLE_PERSON[w.role]} · {ROLE_LABEL[w.role]}</span>
            </span>
            <ChevronDown className="workspace__chev" aria-hidden />
          </button>
        </RMenu.Trigger>
        <RMenu.Portal>
          <RMenu.Content className="pop menu" align="start" sideOffset={6} collisionPadding={8}>
            <div className="menu__head">View the workspace as</div>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <RMenu.Item key={r} className={["menu__item", r === w.role && "menu__item--on"].filter(Boolean).join(" ")} onSelect={() => w.setRole(r)}>
                <span className="menu__gap" />
                <span>{ROLE_LABEL[r]} — {ROLE_PERSON[r]}</span>
              </RMenu.Item>
            ))}
            <div className="menu__sep" />
            <RMenu.Item className="menu__item" onSelect={() => { window.location.hash = href.portal().slice(1); }}>
              <span className="menu__gap" />
              <span>Open the client portal</span>
            </RMenu.Item>
            <RMenu.Item className="menu__item" disabled>
              <span className="menu__gap" />
              <span>Manage Workspace</span>
              <span className="menu__why">Not in this demo</span>
            </RMenu.Item>
            <RMenu.Item className="menu__item" disabled>
              <span className="menu__gap" />
              <span>Sign out</span>
              <span className="menu__why">Not in this demo</span>
            </RMenu.Item>
          </RMenu.Content>
        </RMenu.Portal>
      </RMenu.Root>

      <div className="sidebar__list">
        {item("home", "Home", Home, href.home(), route.page === "home", needs && !folded ? <span className="navitem__count">{needs}</span> : null)}
        {top.map((p) => {
          const kids = PROJECTS.filter((k) => k.parent === p.id);
          const childActive = kids.some((k) => k.id === activeProject);
          return (
            <div key={p.id}>
              {item(
                p.id,
                p.name,
                p.icon,
                href.project(p.id),
                activeProject === p.id,
                kids.length && !folded ? (
                  <button
                    className="navitem__fold"
                    aria-label={open[p.id] ? `Fold ${p.name}` : `Unfold ${p.name}`}
                    aria-expanded={!!open[p.id]}
                    onClick={(e) => { e.preventDefault(); setOpen((o) => ({ ...o, [p.id]: !o[p.id] })); }}
                  >
                    {open[p.id] || childActive ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                  </button>
                ) : null,
              )}
              {(open[p.id] || childActive) && !folded ? kids.map((k) => item(k.id, k.name, k.icon, href.project(k.id), activeProject === k.id, null, 1)) : null}
            </div>
          );
        })}
        {folded ? (
          <Tip text="Projects are fixed in this demo" side="right">
            <span className="navitem navitem--off" tabIndex={0} aria-label="New project — fixed in this demo">
              <Plus className="navitem__ico" aria-hidden />
              <span className="navitem__label">New</span>
            </span>
          </Tip>
        ) : (
          <Tip text="Projects are fixed in this demo" side="right">
            <span className="navitem navitem--off" tabIndex={0}>
              <Plus className="navitem__ico" aria-hidden />
              <span className="navitem__label">New project</span>
            </span>
          </Tip>
        )}
      </div>

      <div className="sidebar__bottom">
        {item("intelligence", "Intelligence", Sparkles, href.intelligence(), route.page === "intelligence")}
        {item("settings", "Settings", Settings, href.settings(), route.page === "settings")}
      </div>
    </nav>
  );
}
