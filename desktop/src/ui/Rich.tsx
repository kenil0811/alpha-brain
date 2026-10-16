/**
 * Replies are Markdown, rendered for real (slice 1 of the conversation proposal, 16 Oct 2026):
 * paragraphs, lists, **bold**, `code`, headings as small semibold lines, links that open in the
 * browser, tables in the module table's look, fenced code with Copy, quotes. No raw HTML is ever
 * rendered, so text inside a reply stays text. The same wherever Alpha speaks (the panel, the
 * page, the companion). While a reply streams, the part up to its last blank line is rendered as
 * Markdown and the rest as plain text with bold and code only, so a half-written list or table
 * never re-flows the page.
 */
import { type ReactNode, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconButton } from "./IconButton";
import { Copy } from "./icons";

export function Rich({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const clean = text.replace(/\r\n/g, "\n");
  const { stable, tail } = streaming ? split(clean) : { stable: clean, tail: "" };
  return (
    <>
      {stable ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
          {stable}
        </ReactMarkdown>
      ) : null}
      {tail ? <p className="rich__tail">{inline(tail)}</p> : null}
    </>
  );
}

/** The stable part (up to and including the last blank line) and the tail still being written. */
export function split(text: string): { stable: string; tail: string } {
  const at = text.lastIndexOf("\n\n");
  if (at < 0) return { stable: "", tail: text };
  return { stable: text.slice(0, at + 2), tail: text.slice(at + 2) };
}

/** **bold** and `code` inside the tail; everything else stays as written. */
function inline(line: string): ReactNode {
  return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <div className="rich__code">
      <pre>
        <code>{text}</code>
      </pre>
      <IconButton size="sm" label={copied ? "Copied" : "Copy"} icon={<Copy size={14} />} onClick={copy} />
    </div>
  );
}

const heading: Components["h1"] = ({ node: _node, children }) => <h4 className="rich__h">{children}</h4>;

const COMPONENTS: Components = {
  a: ({ node: _node, href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  strong: ({ node: _node, children }) => <b>{children}</b>,
  ul: ({ node: _node, children }) => <ul className="rich__list">{children}</ul>,
  ol: ({ node: _node, children, start }) => (
    <ol className="rich__list" start={start}>
      {children}
    </ol>
  ),
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  blockquote: ({ node: _node, children }) => <blockquote className="rich__quote">{children}</blockquote>,
  table: ({ node: _node, children }) => (
    <div className="rich__tablewrap">
      <table className="rich__table">{children}</table>
    </div>
  ),
  pre: ({ node: _node, children }) => <>{children}</>,
  code: ({ node: _node, className, children }) => {
    const raw = String(children ?? "");
    const block = /language-/.test(className ?? "") || raw.includes("\n");
    return block ? <CodeBlock text={raw.replace(/\n$/, "")} /> : <code>{children}</code>;
  },
};
