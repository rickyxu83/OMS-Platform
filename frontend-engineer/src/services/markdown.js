function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHref(value) {
  const href = String(value || '').trim()
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href
  if (href.startsWith('/') && !href.startsWith('//')) return href
  return ''
}

function inlineMarkdown(value) {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const safe = safeHref(href)
      if (!safe) return label
      const target = /^https?:/i.test(safe) ? ' target="_blank" rel="noreferrer"' : ''
      return `<a href="${escapeHtml(safe)}"${target}>${label}</a>`
    })
}

export function renderMarkdown(value) {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`)
      index += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(`<li>${inlineMarkdown(lines[index].replace(/^\s*[-*]\s+/, ''))}</li>`)
        index += 1
      }
      blocks.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${inlineMarkdown(lines[index].replace(/^\s*\d+\.\s+/, ''))}</li>`)
        index += 1
      }
      blocks.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    const paragraph = []
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*[-*]\s+/.test(lines[index])
      && !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraph.push(inlineMarkdown(lines[index]))
      index += 1
    }
    blocks.push(`<p>${paragraph.join('<br>')}</p>`)
  }

  return blocks.join('')
}
