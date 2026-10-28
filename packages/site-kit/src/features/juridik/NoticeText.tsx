import type { ReactNode } from 'react'

type Block = { kind: 'h2'; text: string } | { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

/**
 * Restaurangens integritetstext (vanlig text från admin): "## " är en
 * rubrik, "- " en punkt i en lista, en tom rad ett nytt stycke. Renderas
 * alltid som text, aldrig som HTML.
 */
export function parseNotice(body: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
    } else if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'h2', text: line.slice(3).trim() })
    } else if (line.startsWith('- ')) {
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'ul') last.items.push(line.slice(2).trim())
      else blocks.push({ kind: 'ul', items: [line.slice(2).trim()] })
    } else {
      para.push(line)
    }
  }
  flush()
  return blocks
}

export function NoticeText({ body }: { body: string }) {
  const out: ReactNode[] = parseNotice(body).map((b, i) => {
    if (b.kind === 'h2') return <h2 key={i}>{b.text}</h2>
    if (b.kind === 'ul') return <ul key={i}>{b.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
    return <p key={i}>{b.text}</p>
  })
  return <>{out}</>
}
