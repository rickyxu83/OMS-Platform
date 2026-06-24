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

export function MarkdownContent({ content, className = "" }: { content: string; className?: string }) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
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
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(<li key={index}>{inlineMarkdown(lines[index].replace(/^\s*[-*]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(<li key={index}>{inlineMarkdown(lines[index].replace(/^\s*\d+\.\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items}</ol>);
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
        {paragraph.map((part, partIndex) => (
          <Fragment key={partIndex}>
            {partIndex > 0 && <br />}
            {inlineMarkdown(part)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className={`markdown-content ${className}`}>{blocks}</div>;
}
