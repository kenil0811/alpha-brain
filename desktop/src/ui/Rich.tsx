import type { ReactNode } from "react";

/** Replies come as light Markdown. Rendered the same wherever Alpha speaks (the panel, the
 *  companion): paragraphs, "- " and "1." lists (also when they follow a line of text, as a
 *  model writes them), headings as bold lines, **bold** and `code`. Nothing else: text inside a
 *  reply is text. */
export function Rich({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} lines={block.split("\n")} />
      ))}
    </>
  );
}

const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const HEADING = /^\s*#{1,6}\s+/;

function Block({ lines }: { lines: string[] }) {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BULLET.test(line) || NUMBER.test(line)) {
      const numbered = NUMBER.test(line);
      const test = numbered ? NUMBER : BULLET;
      const items: string[] = [];
      while (i < lines.length && test.test(lines[i])) {
        items.push(lines[i].replace(test, ""));
        i += 1;
      }
      const List = numbered ? "ol" : "ul";
      out.push(
        <List key={key++} className="rich__list">
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={key++}>
        {para.map((l, j) => {
          const heading = HEADING.test(l);
          const body = heading ? <b>{inline(l.replace(HEADING, ""))}</b> : inline(l);
          return j ? [<br key={`b${j}`} />, <span key={j}>{body}</span>] : <span key={j}>{body}</span>;
        })}
      </p>,
    );
  }
  return <>{out}</>;
}

/** **bold** and `code` inside a line; everything else stays as written. */
function inline(line: string): ReactNode {
  return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}
