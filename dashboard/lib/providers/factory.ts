import type { GitProvider } from './types'
import { GitHubProvider } from './github'
import { GitLabProvider } from './gitlab'
import { BitbucketProvider } from './bitbucket'

export function createProvider(spec: string): GitProvider {
  const colonIdx = spec.indexOf(':')
  if (colonIdx === -1) throw new Error(`Invalid provider spec: "${spec}" — expected "provider:owner/repo"`)
  const provider = spec.slice(0, colonIdx)

  switch (provider) {
    case 'github': {
      const token = process.env.FLEETBOARD_GITHUB_TOKEN
      if (!token) throw new Error('FLEETBOARD_GITHUB_TOKEN is not set')
      return new GitHubProvider(token)
    }
    case 'gitlab': {
      const token = process.env.FLEETBOARD_GITLAB_TOKEN
      if (!token) throw new Error('FLEETBOARD_GITLAB_TOKEN is not set')
      const baseUrl = process.env.FLEETBOARD_GITLAB_URL
      return new GitLabProvider(token, baseUrl)
    }
    case 'bitbucket': {
      const token = process.env.FLEETBOARD_BITBUCKET_TOKEN
      const username = process.env.FLEETBOARD_BITBUCKET_USERNAME
      if (!token || !username) throw new Error('FLEETBOARD_BITBUCKET_TOKEN and FLEETBOARD_BITBUCKET_USERNAME must both be set')
      return new BitbucketProvider(token, username)
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export function repoFromSpec(spec: string): string {
  return spec.slice(spec.indexOf(':') + 1)
}
