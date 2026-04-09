export interface Ticket {
  key: string
  description: string
}

const TICKET_RE = /[A-Z]+-[0-9]+/

export function extractTickets(messages: string[]): Ticket[] {
  const descs = new Map<string, string[]>()
  const order: string[] = []

  for (const msg of messages) {
    const line = msg.trim()
    if (!line) continue
    const match = line.match(TICKET_RE)
    if (!match) continue
    const key = match[0]
    if (!descs.has(key)) {
      descs.set(key, [])
      order.push(key)
    }
    descs.get(key)!.push(line)
  }

  const keys = [...order].sort()
  return keys.map(key => ({
    key,
    description: descs.get(key)!.join('\n')
  }))
}
