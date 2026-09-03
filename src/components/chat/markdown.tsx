import { Fragment } from "react";

/**
 * Minimal, dependency-free Markdown renderer for chat bubbles.
 *
 * The assistant is prompted to reply in plain text, but models still slip in
 * Markdown occasionally — this renders the common subset (bold, italic, inline
 * code, links, headings, ordered/unordered lists) so those don't show up as raw
 * `**`/`#` symbols on the website widget. Deliberately small: it is NOT a full
 * CommonMark parser (no tables, blockquotes, images, or nested lists).
 *
 * Safety: output is React elements (never `dangerouslySetInnerHTML`), so text is
 * auto-escaped, and link URLs are restricted to http(s)/mailto — model-authored
 * content can't inject markup or `javascript:` URLs.
 */

const SAFE_URL = /^(https?:|mailto:)/i;

// One pass over a line of text, emitting styled spans for inline Markdown.
// Order in the alternation matters: bold (**/__) before italic (*/_) so the
// double-delimiter wins; code and links are unambiguous.
const INLINE =
  /(\*\*|__)(.+?)\1|(\*|_)(?=\S)([^*_\n]+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1]) {
      nodes.push(<strong key={key}>{m[2]}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={key}>{m[4]}</em>);
    } else if (m[5] != null) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/15"
        >
          {m[5]}
        </code>,
      );
    } else if (m[6] != null) {
      const url = m[7];
      if (SAFE_URL.test(url)) {
        nodes.push(
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {m[6]}
          </a>,
        );
      } else {
        nodes.push(m[0]); // unsafe/relative URL — leave the raw text as-is
      }
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Render a Markdown string as safe React nodes. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const k = `p${key++}`;
    const buf = para;
    para = [];
    out.push(
      <p key={k} className="leading-relaxed">
        {buf.map((ln, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(ln, `${k}-${idx}`)}
          </Fragment>
        ))}
      </p>,
    );
  };

  const flushList = () => {
    if (!list) return;
    const k = `l${key++}`;
    const current = list;
    list = null;
    const items = current.items.map((it, idx) => (
      <li key={idx}>{renderInline(it, `${k}-${idx}`)}</li>
    ));
    out.push(
      current.ordered ? (
        <ol key={k} className="list-decimal space-y-0.5 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={k} className="list-disc space-y-0.5 pl-5">
          {items}
        </ul>
      ),
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const k = `h${key++}`;
      out.push(
        <p key={k} className="font-semibold">
          {renderInline(heading[2], k)}
        </p>,
      );
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }

    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  return <div className="space-y-1.5">{out}</div>;
}
