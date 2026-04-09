import type { GitProvider } from './types'

export class GitHubProvider implements GitProvider {
  constructor(private readonly token: string) {}

  async getCommitMessages(repo: string, from: string, to: string): Promise<string[]> {
    const url = `https://api.github.com/repos/${repo}/compare/${from}...${to}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    })
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${url}`)
    }
    const data = await res.json() as { commits: Array<{ commit: { message: string } }> }
    return data.commits.map(c => c.commit.message.split('\n')[0])
  }
}
