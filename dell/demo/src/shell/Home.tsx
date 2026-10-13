import { ArrowRight, CalendarClock, CircleAlert, CircleCheck, Inbox } from "lucide-react";
import { Card, Pill } from "../kit";
import { DUE, COMING_UP } from "../data/home";
import { href } from "../data/route";
import { ROLE_LABEL, ROLE_PERSON, useWorld } from "../data/store";
import { ProposalCard } from "../views/DataView";
import { PROJECTS } from "../projects/registry";

/** Home (rulebook §11): one centred column, no page header bar. */
export function Home() {
  const w = useWorld();
  const mine = w.proposals.filter((p) => p.roles.includes(w.role));
  const open = mine.filter((p) => p.state === "open");
  const due = DUE.filter((d) => d.roles.includes(w.role));
  const overdue = due.filter((d) => d.bucket === "overdue");
  const today = due.filter((d) => d.bucket === "today");
  const upcoming = due.filter((d) => d.bucket === "upcoming");
  const done = w.activity.filter((a) => a.who === "Alpha" && a.when.startsWith("12 Oct"));
  const first = ROLE_PERSON[w.role].split(" ")[0];

  return (
    <div className="home">
      <div className="home__head">
        <div className="eyebrow eyebrow--accent">Monday 12 Oct 2026 · {ROLE_LABEL[w.role]}</div>
        <h1 className="hero">Good morning, {first}</h1>
        <p className="home__demo">Sample data — every client, claim, amount and date here is invented for this demo.</p>
      </div>

      <Card className="today" title="Today">
        <div className="tiles">
          <a className="tile" href="#needs">
            <Inbox className="tile__ico" aria-hidden />
            <span className="tile__label">Needs you</span>
            <span className="tile__num">{open.length}</span>
          </a>
          <div className={["tile", overdue.length && "tile--bad"].filter(Boolean).join(" ")}>
            <CircleAlert className="tile__ico" aria-hidden />
            <span className="tile__label">Due</span>
            <span className="tile__num">{overdue.length + today.length}</span>
            <span className="tile__basis">{overdue.length ? `${overdue.length} overdue · ` : ""}{today.length} today · {upcoming.length} upcoming</span>
          </div>
          <a className="tile" href={href.activity()}>
            <CircleCheck className="tile__ico" aria-hidden />
            <span className="tile__label">Done today</span>
            <span className="tile__num">{done.length}</span>
            <span className="tile__basis">by Alpha</span>
          </a>
          <div className="tile">
            <CalendarClock className="tile__ico" aria-hidden />
            <span className="tile__label">Coming up</span>
            <span className="tile__next">{COMING_UP[w.role]}</span>
          </div>
        </div>

        <h2 className="subhead" id="needs">Needs you</h2>
        {open.length ? (
          <div className="needs">{open.map((p) => <ProposalCard key={p.id} id={p.id} />)}</div>
        ) : (
          <p className="empty">Nothing needs you right now.</p>
        )}
        {mine.some((p) => p.state !== "open") ? (
          <>
            <h2 className="subhead">Decided in this visit</h2>
            <div className="needs">{mine.filter((p) => p.state !== "open").map((p) => <ProposalCard key={p.id} id={p.id} compact />)}</div>
          </>
        ) : null}

        <h2 className="subhead">Due</h2>
        <ul className="duelist">
          {[...overdue, ...today, ...upcoming].map((d) => (
            <li key={d.id}>
              <Pill tone={d.bucket === "overdue" ? "red" : d.bucket === "today" ? "yellow" : "gray"}>{d.bucket === "overdue" ? "Overdue" : d.bucket === "today" ? "Today" : "Upcoming"}</Pill>
              <a href={d.link}>{d.title}</a>
              <span className="meta">{d.when}</span>
            </li>
          ))}
        </ul>
      </Card>

      <h2 className="subhead subhead--grid">Projects</h2>
      <div className="grid">
        {PROJECTS.filter((p) => !p.parent).map((p) => (
          <a key={p.id} className="pcard" href={href.project(p.id)}>
            <span className="pcard__ico"><p.icon aria-hidden /></span>
            <span className="pcard__name">{p.name}</span>
            <span className="pcard__desc">{p.summary}</span>
            <span className="pcard__open">Open <ArrowRight aria-hidden /></span>
          </a>
        ))}
      </div>
    </div>
  );
}
