import type { Ticket } from '@/lib/tickets'

export type { Ticket }

export interface GitProvider {
  /**
   * Returns the first line (subject) of each commit message
   * for all commits reachable from `to` but not from `from`.
   * Throws if the API call fails or either tag is not found.
   */
  getCommitMessages(repo: string, from: string, to: string): Promise<string[]>
}
