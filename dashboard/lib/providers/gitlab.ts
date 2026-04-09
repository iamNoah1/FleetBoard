import type { GitProvider } from './types'

export class GitLabProvider implements GitProvider {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = 'https://gitlab.com'
  ) {}

  async getCommitMessages(repo: string, from: string, to: string): Promise<string[]> {
    const encoded = encodeURIComponent(repo)
    const params = new URLSearchParams({ from, to })
    const base = this.baseUrl.replace(/\/$/, '')
    const url = `${base}/api/v4/projects/${encoded}/repository/compare?${params}`
    const res = await fetch(url, {
      headers: { 'PRIVATE-TOKEN': this.token }
    })
    if (!res.ok) {
      throw new Error(`GitLab API ${res.status}: ${url}`)
    }
    const data = await res.json() as { commits: Array<{ title: string }> }
    return data.commits.map(c => c.title)
  }
}
