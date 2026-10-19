/** Where a value came from (P5): its source in words beside it; a web address opens, and a
 *  document opens here at the place the value sat, read again from the kept file (a sheet's
 *  cell among its neighbours, or a page with the value's line marked), with the file itself a
 *  click away in the Mac's own app. */
import { useEffect, useState } from "react";
import type { DocumentPlace, ValueSource } from "../../core/client";
import { say } from "../../core/client";
import { host } from "../../core/host";
import { Button, Popover } from "../../ui";

export type PlaceOf = (source: ValueSource) => Promise<DocumentPlace>;

export function SourceLink({ origin, value, placeOf }: { origin: ValueSource; value?: unknown; placeOf?: PlaceOf }) {
  const words = origin.source ?? "";
  if (!words) return null;
  if (origin.kind === "url" && origin.url) {
    return (
      <a href={origin.url} target="_blank" rel="noreferrer">
        from {words}
      </a>
    );
  }
  if (origin.kind !== "document" || !origin.document || !placeOf) return <>from {words}</>;
  return (
    <Popover
      label={`Where it came from: ${words}`}
      align="start"
      trigger={
        <button type="button" className="linkbtn" title={`Show ${words}`}>
          from {words}
        </button>
      }
    >
      <SourcePlace origin={origin} value={value} placeOf={placeOf} />
    </Popover>
  );
}

/** Digits and words only, so 3,400.00 on a page is the value 3400. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s,£$€]/g, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

export function SourcePlace({ origin, value, placeOf }: { origin: ValueSource; value?: unknown; placeOf: PlaceOf }) {
  const [place, setPlace] = useState<DocumentPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    placeOf(origin).then(
      (p) => live && setPlace(p),
      (e) => live && setError(say(e)),
    );
    return () => {
      live = false;
    };
  }, [origin, placeOf]);
  if (error) return <p className="notice">{error}</p>;
  if (!place) return <p className="faint place__wait">Reading it…</p>;
  const hit = place.rows?.flatMap((r) => r.cells).find((c) => c.cell === place.cell);
  const wanted = value === undefined || value === null || value === "" ? "" : plain(String(value));
  return (
    <div className="place" aria-label={`${place.title} at ${place.cell ? `${place.sheet} ${place.cell}` : place.page ? `page ${place.page}` : "its start"}`}>
      <div className="place__head">
        <b>{place.title}</b> <span className="faint">{place.cell ? `${place.sheet} · ${place.cell}` : place.page ? `page ${place.page}` : ""}</span>
      </div>
      {place.rows && place.columns ? (
        <table className="place__grid">
          <thead>
            <tr>
              <th aria-label="Row" />
              {place.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {place.rows.map((r) => (
              <tr key={r.row}>
                <th scope="row">{r.row}</th>
                {r.cells.map((c) => (
                  <td key={c.cell} className={c.cell === place.cell ? "place__hit" : undefined} title={c.formula ?? undefined}>
                    {c.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {hit?.formula ? <p className="faint place__formula">{`${place.cell} ${hit.formula}`}</p> : null}
      {place.text !== undefined ? (
        <div className="place__page">
          {place.text
            .split("\n")
            .filter((line, i, all) => line.trim() || (i > 0 && all[i - 1].trim()))
            .map((line, i) => (
              <p key={i} className={wanted && plain(line).includes(wanted) ? "place__hit" : undefined}>
                {line || " "}
              </p>
            ))}
        </div>
      ) : null}
      {host.available() ? (
        <div className="row">
          <Button size="sm" onClick={() => void host.openPath(place.path)}>
            Open the file
          </Button>
        </div>
      ) : null}
    </div>
  );
}
