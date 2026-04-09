import type { GitProvider } from './types'

export class BitbucketProvider implements GitProvider {
  constructor(
    private readonly token: string,
    private readonly username: string
  ) {}

  async getCommitMessages(repo: string, from: string, to: string): Promise<string[]> {
    const [workspace, slug] = repo.split('/')
    const params = new URLSearchParams({ include: to, exclude: from })
    const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${slug}/commits?${params}`
    const credentials = Buffer.from(`${this.username}:${this.token}`).toString('base64')
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` }
    })
    if (!res.ok) {
      throw new Error(`Bitbucket API ${res.status}: ${url}`)
    }
    const data = await res.json() as { values: Array<{ message: string }> }
    return data.values.map(c => c.message.split('\n')[0])
  }
}
