import { createProvider, repoFromSpec } from '@/lib/providers/factory'
import { GitHubProvider } from '@/lib/providers/github'
import { GitLabProvider } from '@/lib/providers/gitlab'
import { BitbucketProvider } from '@/lib/providers/bitbucket'

describe('createProvider', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns a GitHubProvider when provider is github', () => {
    process.env.FLEETBOARD_GITHUB_TOKEN = 'ghp_test'
    expect(createProvider('github:myorg/myapp')).toBeInstanceOf(GitHubProvider)
  })

  it('returns a GitLabProvider when provider is gitlab', () => {
    process.env.FLEETBOARD_GITLAB_TOKEN = 'glpat_test'
    expect(createProvider('gitlab:myorg/myapp')).toBeInstanceOf(GitLabProvider)
  })

  it('returns a BitbucketProvider when provider is bitbucket', () => {
    process.env.FLEETBOARD_BITBUCKET_TOKEN = 'mytoken'
    process.env.FLEETBOARD_BITBUCKET_USERNAME = 'myuser'
    expect(createProvider('bitbucket:myorg/myapp')).toBeInstanceOf(BitbucketProvider)
  })

  it('throws for unknown provider name', () => {
    expect(() => createProvider('unknown:myorg/myapp')).toThrow('Unknown provider: unknown')
  })

  it('throws when GitHub token is missing', () => {
    delete process.env.FLEETBOARD_GITHUB_TOKEN
    expect(() => createProvider('github:myorg/myapp')).toThrow('FLEETBOARD_GITHUB_TOKEN is not set')
  })

  it('throws when GitLab token is missing', () => {
    delete process.env.FLEETBOARD_GITLAB_TOKEN
    expect(() => createProvider('gitlab:myorg/myapp')).toThrow('FLEETBOARD_GITLAB_TOKEN is not set')
  })

  it('throws when Bitbucket token is missing', () => {
    process.env.FLEETBOARD_BITBUCKET_USERNAME = 'myuser'
    delete process.env.FLEETBOARD_BITBUCKET_TOKEN
    expect(() => createProvider('bitbucket:myorg/myapp')).toThrow('FLEETBOARD_BITBUCKET_TOKEN and FLEETBOARD_BITBUCKET_USERNAME must both be set')
  })

  it('throws on malformed spec without colon', () => {
    expect(() => createProvider('githubmyorg')).toThrow('Invalid provider spec')
  })
})

describe('repoFromSpec', () => {
  it('returns the part after the first colon', () => {
    expect(repoFromSpec('github:myorg/myapp')).toBe('myorg/myapp')
    expect(repoFromSpec('gitlab:myorg/myapp')).toBe('myorg/myapp')
    expect(repoFromSpec('bitbucket:myorg/myapp')).toBe('myorg/myapp')
  })
})
