import { Fragment, type ReactNode } from "react";

function safeHref(value: string) {
  const href = value.trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return "";
}

function inlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[(red|blue|green)\][\s\S]+?\[\/\2\]|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{inlineMarkdown(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{inlineMarkdown(token.slice(1, -1))}</em>);
    } else if (/^\[(red|blue|green)\]/.test(token)) {
      const color = token.match(/^\[(red|blue|green)\]/)?.[1] || "blue";
      const content = token.replace(/^\[(red|blue|green)\]/, "").replace(new RegExp(`\\[/${color}\\]$`), "");
      nodes.push(
        <span key={key} className={`markdown-color markdown-color-${color}`}>
          {inlineMarkdown(content)}
        </span>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeHref(link[2]) : "";
      nodes.push(href ? (
        <a key={key} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {link?.[1] || href}
        </a>
      ) : token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function normalizeMarkdownLines(content: string) {
  const rawLines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const line = rawLine.replace(/([^\s])\s+(\d{1,2})\.\s+(?=\S)/g, "$1\n$2. ");
    lines.push(...line.split("\n"));
  }
  return lines;
}

function renderInlineLines(lines: string[]) {
  return lines.map((part, partIndex) => (
    <Fragment key={partIndex}>
      {partIndex > 0 && <br />}
      {inlineMarkdown(part)}
    </Fragment>
  ));
}

export function MarkdownContent({ content, className = "" }: { content: string; className?: string }) {
  const lines = normalizeMarkdownLines(content);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (codeFence) {
      const language = codeFence[1] || "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${index}`} data-language={language || undefined}>
          <code>{codeLines.join("\n") || " "}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${level}` as keyof JSX.IntrinsicElements);
      blocks.push(<Tag key={index}>{inlineMarkdown(heading[2])}</Tag>);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        if (!lines[index].trim()) {
          const nextIndex = index + 1;
          if (nextIndex < lines.length && /^\s*[-*]\s+/.test(lines[nextIndex])) {
            index = nextIndex;
            continue;
          }
          break;
        }
        if (!/^\s*[-*]\s+/.test(lines[index])) break;
        const itemLines = [lines[index].replace(/^\s*[-*]\s+/, "")];
        index += 1;
        while (
          index < lines.length
          && lines[index].trim()
          && !/^(#{1,3})\s+/.test(lines[index])
          && !/^\s*[-*]\s+/.test(lines[index])
          && !/^\s*\d+\.\s+/.test(lines[index])
        ) {
          itemLines.push(lines[index].trim());
          index += 1;
        }
        items.push(<li key={index}>{renderInlineLines(itemLines)}</li>);
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }

    const orderedStart = line.match(/^\s*(\d+)\.\s+/);
    if (orderedStart) {
      const startNumber = Number(orderedStart[1]) || 1;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        if (!lines[index].trim()) {
          let nextIndex = index + 1;
          while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
          if (nextIndex < lines.length && /^\s*\d+\.\s+/.test(lines[nextIndex])) {
            index = nextIndex;
            continue;
          }
          break;
        }
        if (!/^\s*\d+\.\s+/.test(lines[index])) break;
        const itemLines = [lines[index].replace(/^\s*\d+\.\s+/, "")];
        index += 1;
        while (
          index < lines.length
          && lines[index].trim()
          && !/^(#{1,3})\s+/.test(lines[index])
          && !/^\s*[-*]\s+/.test(lines[index])
          && !/^\s*\d+\.\s+/.test(lines[index])
        ) {
          itemLines.push(lines[index].trim());
          index += 1;
        }
        items.push(<li key={index}>{renderInlineLines(itemLines)}</li>);
      }
      blocks.push(<ol key={`ol-${index}`} start={startNumber}>{items}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*[-*]\s+/.test(lines[index])
      && !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`}>
        {renderInlineLines(paragraph)}
      </p>,
    );
  }

  return <div className={`markdown-content ${className}`}>{blocks}</div>;
}
