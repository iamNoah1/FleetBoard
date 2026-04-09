export interface Ticket {
  key: string
  description: string
}

const TICKET_RE = /[A-Z]+-[0-9]+/g

export function extractTickets(messages: string[]): Ticket[] {
  const descs = new Map<string, string[]>()

  for (const msg of messages) {
    const line = msg.trim()
    if (!line) continue
    for (const match of line.matchAll(TICKET_RE)) {
      const key = match[0]
      if (!descs.has(key)) descs.set(key, [])
      descs.get(key)!.push(line)
    }
  }

  return [...descs.keys()].sort().map(key => ({
    key,
    description: descs.get(key)!.join('\n')
  }))
}
