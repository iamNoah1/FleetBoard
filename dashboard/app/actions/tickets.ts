'use server'

import { extractTickets } from '@/lib/tickets'
import { resolveTag } from '@/lib/tags'
import { createProvider, repoFromSpec } from '@/lib/providers/factory'
import type { Ticket } from '@/lib/tickets'

export interface TicketResult {
  tickets: Ticket[]
  error?: string
}

function parseRepoMap(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const eq = entry.indexOf('=')
    if (eq === -1) continue
    const deployment = entry.slice(0, eq).trim()
    const spec = entry.slice(eq + 1).trim()
    if (deployment && spec) result[deployment] = spec
  }
  return result
}

export async function fetchTickets(
  deployment: string,
  fromVersion: string,
  toVersion: string
): Promise<TicketResult> {
  const repoMap = parseRepoMap(process.env.FLEETBOARD_REPO_MAP ?? '')
  const tagPrefix = process.env.FLEETBOARD_TAG_PREFIX

  const spec = repoMap[deployment]
  if (!spec) {
    return { tickets: [], error: `No repository configured for deployment "${deployment}"` }
  }

  let provider: ReturnType<typeof createProvider>
  try {
    provider = createProvider(spec)
  } catch (err) {
    return { tickets: [], error: (err as Error).message }
  }

  const repo = repoFromSpec(spec)
  const fromTags = resolveTag(fromVersion, tagPrefix)
  const toTags = resolveTag(toVersion, tagPrefix)

  for (const fromTag of fromTags) {
    for (const toTag of toTags) {
      try {
        const messages = await provider.getCommitMessages(repo, fromTag, toTag)
        return { tickets: extractTickets(messages) }
      } catch {
        // try next tag combination
      }
    }
  }

  return {
    tickets: [],
    error: `Could not resolve tags for versions ${fromVersion}..${toVersion} in ${repo}`
  }
}
