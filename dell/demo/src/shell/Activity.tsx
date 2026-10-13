import { Search } from "lucide-react";
import { useState } from "react";
import { Card } from "../kit";
import { useWorld } from "../data/store";
import { PageHeader } from "../views/ProjectPage";

/** Activity: everything Alpha did and read, and what people changed, search first. */
export function ActivityPage() {
  const w = useWorld();
  const [q, setQ] = useState("");
  const rows = w.activity.filter((a) => `${a.who} ${a.what}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <PageHeader><h1 className="pagehead__title">Activity</h1></PageHeader>
      <div className="main__body">
        <div className="readcol">
          <label className="searchbox searchbox--wide">
            <Search aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity" aria-label="Search activity" />
          </label>
          <Card title="12 Oct 2026">
            {rows.length ? (
              <ul className="activity">
                {rows.map((a) => (
                  <li key={a.id} className={a.failed ? "activity__row activity__row--bad" : "activity__row"}>
                    <span className="meta activity__when">{a.when}</span>
                    <span className="activity__who">{a.who}</span>
                    {a.link ? <a href={a.link}>{a.what}</a> : <span>{a.what}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Nothing matches “{q}”.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
