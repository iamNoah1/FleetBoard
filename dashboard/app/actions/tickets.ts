'use server'

import { extractTickets } from '@/lib/tickets'
import { resolveTag } from '@/lib/tags'
import { createProvider, repoFromSpec } from '@/lib/providers/factory'
import type { Ticket } from '@/lib/tickets'

export interface TicketResult {
  tickets: Ticket[]
  error?: string
}

const debug = process.env.FLEETBOARD_DEBUG === 'true'
  ? (...args: unknown[]) => console.log('[fleetboard:tickets]', ...args)
  : () => {}

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

  debug(`fetchTickets deployment=${deployment} from=${fromVersion} to=${toVersion}`)
  debug(`repoMap keys: [${Object.keys(repoMap).join(', ')}]`)

  const spec = repoMap[deployment]
  if (!spec) {
    debug(`no repo configured for "${deployment}"`)
    return { tickets: [], error: `No repository configured for deployment "${deployment}"` }
  }

  debug(`resolved spec: ${spec}`)

  let provider: ReturnType<typeof createProvider>
  try {
    provider = createProvider(spec)
  } catch (err) {
    debug(`provider creation failed: ${(err as Error).message}`)
    return { tickets: [], error: (err as Error).message }
  }

  const repo = repoFromSpec(spec)
  const fromTags = resolveTag(fromVersion, tagPrefix)
  const toTags = resolveTag(toVersion, tagPrefix)

  debug(`repo=${repo} tagPrefix=${tagPrefix ?? '(auto)'} fromTags=${fromTags} toTags=${toTags}`)

  for (const fromTag of fromTags) {
    for (const toTag of toTags) {
      try {
        debug(`trying ${fromTag}...${toTag}`)
        const messages = await provider.getCommitMessages(repo, fromTag, toTag)
        const tickets = extractTickets(messages)
        debug(`success: ${messages.length} commits, ${tickets.length} tickets`)
        return { tickets }
      } catch (err) {
        debug(`failed ${fromTag}...${toTag}: ${(err as Error).message}`)
      }
    }
  }

  debug(`all tag combinations exhausted`)
  return {
    tickets: [],
    error: `Could not resolve tags for versions ${fromVersion}..${toVersion} in ${repo}`
  }
}
