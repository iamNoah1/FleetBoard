# Jira Ticket Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cluster-delta ticket view to FleetBoard — clicking a matrix cell reveals the Jira tickets present in that cluster's version but not yet in another selected cluster.

**Architecture:** Pure dashboard-side feature. Provider adapters (GitHub/GitLab/Bitbucket) sit behind a `GitProvider` interface; a Next.js Server Action calls the right adapter based on env-var config; a new `DeploymentMatrix` Client Component manages expand state and calls the action. Zero collector changes.

**Tech Stack:** TypeScript, Next.js 14 Server Actions, `fetch` (Node 18+ built-in), Jest + ts-jest for unit tests.

---

## File Map

| Path | Status | Responsibility |
|---|---|---|
| `dashboard/lib/tickets.ts` | **Create** | `extractTickets()` — parse `[A-Z]+-[0-9]+` from commit messages |
| `dashboard/lib/tags.ts` | **Create** | `resolveTag()` — expand version string into candidate git tag names |
| `dashboard/lib/providers/types.ts` | **Create** | `GitProvider` interface, `Ticket` type |
| `dashboard/lib/providers/github.ts` | **Create** | GitHub Compare API implementation |
| `dashboard/lib/providers/gitlab.ts` | **Create** | GitLab Compare API implementation |
| `dashboard/lib/providers/bitbucket.ts` | **Create** | Bitbucket Commits API implementation |
| `dashboard/lib/providers/factory.ts` | **Create** | Parse `provider:owner/repo` spec, return correct provider |
| `dashboard/app/actions/tickets.ts` | **Create** | Server Action `fetchTickets()` |
| `dashboard/app/components/CellDetail.tsx` | **Create** | Client Component — cluster picker + ticket list |
| `dashboard/app/components/DeploymentMatrix.tsx` | **Create** | Client Component — matrix table with expand state |
| `dashboard/__tests__/tickets.test.ts` | **Create** | Unit tests for `extractTickets` |
| `dashboard/__tests__/tags.test.ts` | **Create** | Unit tests for `resolveTag` |
| `dashboard/__tests__/providers/github.test.ts` | **Create** | Unit tests for GitHub provider |
| `dashboard/__tests__/providers/gitlab.test.ts` | **Create** | Unit tests for GitLab provider |
| `dashboard/__tests__/providers/bitbucket.test.ts` | **Create** | Unit tests for Bitbucket provider |
| `dashboard/__tests__/providers/factory.test.ts` | **Create** | Unit tests for provider factory |
| `dashboard/jest.config.ts` | **Create** | Jest config with ts-jest and `@/` path alias |
| `dashboard/package.json` | **Modify** | Add jest, ts-jest, @types/jest dev deps; add `test` script |
| `dashboard/app/page.tsx` | **Modify** | Extract serialisable row data; render `DeploymentMatrix` |
| `dashboard/helm/fleetboard-dashboard/values.yaml` | **Modify** | Add `repoMap`, `tagPrefix`, `gitProviders` |
| `dashboard/helm/fleetboard-dashboard/templates/secret.yaml` | **Modify** | Inject provider tokens into Secret |
| `dashboard/helm/fleetboard-dashboard/templates/deployment.yaml` | **Modify** | Add `FLEETBOARD_REPO_MAP` and `FLEETBOARD_TAG_PREFIX` env vars |
| `README.md` | **Modify** | Document ticket visibility feature and new config |

---

## Task 1: Jest test infrastructure

**Files:**
- Create: `dashboard/jest.config.ts`
- Modify: `dashboard/package.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd dashboard
npm install --save-dev jest @types/jest ts-jest
```

Expected: packages appear in `package.json` devDependencies.

- [ ] **Step 2: Create jest config**

Create `dashboard/jest.config.ts`:

```typescript
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
        jsx: 'react',
        strict: true,
        esModuleInterop: true,
      }
    }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']
}

export default config
```

- [ ] **Step 3: Add test script to package.json**

In `dashboard/package.json`, add to `"scripts"`:

```json
"test": "jest"
```

- [ ] **Step 4: Verify setup runs cleanly**

```bash
cd dashboard
npm test -- --passWithNoTests
```

Expected: `Test Suites: 0 of 0 total` — no errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/jest.config.ts dashboard/package.json dashboard/package-lock.json
git commit -m "chore(dashboard): add jest + ts-jest test infrastructure"
```

---

## Task 2: Ticket extraction utility (TDD)

**Files:**
- Create: `dashboard/__tests__/tickets.test.ts`
- Create: `dashboard/lib/tickets.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/__tests__/tickets.test.ts`:

```typescript
import { extractTickets } from '@/lib/tickets'

describe('extractTickets', () => {
  it('returns empty array for empty input', () => {
    expect(extractTickets([])).toEqual([])
  })

  it('extracts a single ticket key and its commit subject', () => {
    expect(extractTickets(['ABC-123 fix login bug'])).toEqual([
      { key: 'ABC-123', description: 'ABC-123 fix login bug' }
    ])
  })

  it('deduplicates the same ticket across multiple commits', () => {
    const result = extractTickets(['ABC-123 fix login', 'ABC-123 follow-up fix'])
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('ABC-123')
    expect(result[0].description).toBe('ABC-123 fix login\nABC-123 follow-up fix')
  })

  it('sorts tickets alphabetically by key', () => {
    const result = extractTickets(['ZZZ-1 something', 'AAA-1 something else'])
    expect(result.map(t => t.key)).toEqual(['AAA-1', 'ZZZ-1'])
  })

  it('ignores messages without ticket references', () => {
    expect(extractTickets(['chore: update deps', 'fix typo'])).toEqual([])
  })

  it('extracts multiple distinct tickets from different messages', () => {
    const result = extractTickets(['ABC-1 feat', 'DEF-2 fix'])
    expect(result).toHaveLength(2)
    expect(result.map(t => t.key)).toEqual(['ABC-1', 'DEF-2'])
  })

  it('ignores blank lines', () => {
    expect(extractTickets(['', '  ', 'ABC-1 fix'])).toEqual([
      { key: 'ABC-1', description: 'ABC-1 fix' }
    ])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd dashboard && npm test -- tickets.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/tickets'`

- [ ] **Step 3: Implement extractTickets**

Create `dashboard/lib/tickets.ts`:

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd dashboard && npm test -- tickets.test.ts
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/tickets.ts dashboard/__tests__/tickets.test.ts
git commit -m "feat(dashboard): add ticket extraction utility"
```

---

## Task 3: Tag resolution utility (TDD)

**Files:**
- Create: `dashboard/__tests__/tags.test.ts`
- Create: `dashboard/lib/tags.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/__tests__/tags.test.ts`:

```typescript
import { resolveTag } from '@/lib/tags'

describe('resolveTag', () => {
  it('returns a single candidate when prefix is set', () => {
    expect(resolveTag('1.2.3', 'release/')).toEqual(['release/1.2.3'])
  })

  it('returns three candidates when no prefix given', () => {
    expect(resolveTag('1.2.3')).toEqual(['release/1.2.3', 'v1.2.3', '1.2.3'])
  })

  it('returns three candidates when prefix is empty string', () => {
    expect(resolveTag('1.2.3', '')).toEqual(['release/1.2.3', 'v1.2.3', '1.2.3'])
  })

  it('handles versions that already look like tags', () => {
    expect(resolveTag('v1.2.3')).toEqual(['release/v1.2.3', 'vv1.2.3', 'v1.2.3'])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd dashboard && npm test -- tags.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/tags'`

- [ ] **Step 3: Implement resolveTag**

Create `dashboard/lib/tags.ts`:

```typescript
export function resolveTag(version: string, prefix?: string): string[] {
  if (prefix) return [`${prefix}${version}`]
  return [`release/${version}`, `v${version}`, version]
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd dashboard && npm test -- tags.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/tags.ts dashboard/__tests__/tags.test.ts
git commit -m "feat(dashboard): add tag resolution utility"
```

---

## Task 4: Provider types

**Files:**
- Create: `dashboard/lib/providers/types.ts`

No tests — this file contains only interfaces.

- [ ] **Step 1: Create provider types**

Create `dashboard/lib/providers/types.ts`:

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
cd dashboard && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/lib/providers/types.ts
git commit -m "feat(dashboard): add GitProvider interface"
```

---

## Task 5: GitHub provider (TDD)

**Files:**
- Create: `dashboard/__tests__/providers/github.test.ts`
- Create: `dashboard/lib/providers/github.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/__tests__/providers/github.test.ts`:

```typescript
import { GitHubProvider } from '@/lib/providers/github'

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

describe('GitHubProvider', () => {
  beforeEach(() => mockFetch.mockReset())

  it('calls the GitHub compare API and returns first line of each commit message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        commits: [
          { commit: { message: 'ABC-1 first commit\n\nBody text here' } },
          { commit: { message: 'DEF-2 second commit' } }
        ]
      })
    })

    const provider = new GitHubProvider('ghp_test')
    const messages = await provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/myorg/myapp/compare/v1.0.0...v1.1.0',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghp_test',
          Accept: 'application/vnd.github+json',
        })
      })
    )
    expect(messages).toEqual(['ABC-1 first commit', 'DEF-2 second commit'])
  })

  it('throws with status code on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const provider = new GitHubProvider('ghp_test')
    await expect(
      provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')
    ).rejects.toThrow('GitHub API 404')
  })

  it('returns empty array when commits list is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commits: [] })
    })

    const provider = new GitHubProvider('ghp_test')
    const messages = await provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.0.0')
    expect(messages).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd dashboard && npm test -- github.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/providers/github'`

- [ ] **Step 3: Implement GitHub provider**

Create `dashboard/lib/providers/github.ts`:

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd dashboard && npm test -- github.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/providers/github.ts dashboard/__tests__/providers/github.test.ts
git commit -m "feat(dashboard): add GitHub provider"
```

---

## Task 6: GitLab provider (TDD)

**Files:**
- Create: `dashboard/__tests__/providers/gitlab.test.ts`
- Create: `dashboard/lib/providers/gitlab.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/__tests__/providers/gitlab.test.ts`:

```typescript
import { GitLabProvider } from '@/lib/providers/gitlab'

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

describe('GitLabProvider', () => {
  beforeEach(() => mockFetch.mockReset())

  it('calls the GitLab compare API with URL-encoded repo path and returns commit titles', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        commits: [
          { title: 'ABC-1 first commit' },
          { title: 'DEF-2 second commit' }
        ]
      })
    })

    const provider = new GitLabProvider('glpat_test')
    const messages = await provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')

    const [calledUrl, calledOptions] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('gitlab.com/api/v4/projects/myorg%2Fmyapp/repository/compare')
    expect(calledUrl).toContain('from=v1.0.0')
    expect(calledUrl).toContain('to=v1.1.0')
    expect((calledOptions.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat_test')
    expect(messages).toEqual(['ABC-1 first commit', 'DEF-2 second commit'])
  })

  it('throws with status code on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    const provider = new GitLabProvider('glpat_test')
    await expect(
      provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')
    ).rejects.toThrow('GitLab API 401')
  })

  it('returns empty array when commits list is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commits: [] })
    })

    const provider = new GitLabProvider('glpat_test')
    const messages = await provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.0.0')
    expect(messages).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd dashboard && npm test -- gitlab.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/providers/gitlab'`

- [ ] **Step 3: Implement GitLab provider**

Create `dashboard/lib/providers/gitlab.ts`:

```typescript
import type { GitProvider } from './types'

export class GitLabProvider implements GitProvider {
  constructor(private readonly token: string) {}

  async getCommitMessages(repo: string, from: string, to: string): Promise<string[]> {
    const encoded = encodeURIComponent(repo)
    const params = new URLSearchParams({ from, to })
    const url = `https://gitlab.com/api/v4/projects/${encoded}/repository/compare?${params}`
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd dashboard && npm test -- gitlab.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/providers/gitlab.ts dashboard/__tests__/providers/gitlab.test.ts
git commit -m "feat(dashboard): add GitLab provider"
```

---

## Task 7: Bitbucket provider (TDD)

**Files:**
- Create: `dashboard/__tests__/providers/bitbucket.test.ts`
- Create: `dashboard/lib/providers/bitbucket.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/__tests__/providers/bitbucket.test.ts`:

```typescript
import { BitbucketProvider } from '@/lib/providers/bitbucket'

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

describe('BitbucketProvider', () => {
  beforeEach(() => mockFetch.mockReset())

  it('calls the Bitbucket commits API and returns first line of each message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        values: [
          { message: 'ABC-1 first commit\n\nBody text' },
          { message: 'DEF-2 second commit' }
        ]
      })
    })

    const provider = new BitbucketProvider('mytoken', 'myuser')
    const messages = await provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')

    const [calledUrl, calledOptions] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('api.bitbucket.org/2.0/repositories/myorg/myapp/commits')
    expect(calledUrl).toContain('include=v1.1.0')
    expect(calledUrl).toContain('exclude=v1.0.0')
    const authHeader = (calledOptions.headers as Record<string, string>).Authorization
    expect(authHeader).toMatch(/^Basic /)
    expect(messages).toEqual(['ABC-1 first commit', 'DEF-2 second commit'])
  })

  it('sends correct Basic Auth credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ values: [] })
    })

    const provider = new BitbucketProvider('mytoken', 'myuser')
    await provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')

    const [, calledOptions] = mockFetch.mock.calls[0] as [string, RequestInit]
    const authHeader = (calledOptions.headers as Record<string, string>).Authorization
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString()
    expect(decoded).toBe('myuser:mytoken')
  })

  it('throws with status code on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

    const provider = new BitbucketProvider('mytoken', 'myuser')
    await expect(
      provider.getCommitMessages('myorg/myapp', 'v1.0.0', 'v1.1.0')
    ).rejects.toThrow('Bitbucket API 403')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd dashboard && npm test -- bitbucket.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/providers/bitbucket'`

- [ ] **Step 3: Implement Bitbucket provider**

Create `dashboard/lib/providers/bitbucket.ts`:

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd dashboard && npm test -- bitbucket.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/providers/bitbucket.ts dashboard/__tests__/providers/bitbucket.test.ts
git commit -m "feat(dashboard): add Bitbucket provider"
```

---

## Task 8: Provider factory (TDD)

**Files:**
- Create: `dashboard/__tests__/providers/factory.test.ts`
- Create: `dashboard/lib/providers/factory.ts`

- [ ] **Step 1: Write failing tests**

Create `dashboard/__tests__/providers/factory.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd dashboard && npm test -- factory.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/providers/factory'`

- [ ] **Step 3: Implement provider factory**

Create `dashboard/lib/providers/factory.ts`:

```typescript
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
      return new GitLabProvider(token)
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
cd dashboard && npm test -- factory.test.ts
```

Expected: PASS — 8 tests passing.

- [ ] **Step 5: Run all tests to confirm nothing broke**

```bash
cd dashboard && npm test
```

Expected: PASS — all tests passing.

- [ ] **Step 6: Commit**

```bash
git add dashboard/lib/providers/factory.ts dashboard/__tests__/providers/factory.test.ts
git commit -m "feat(dashboard): add provider factory"
```

---

## Task 9: Server Action

**Files:**
- Create: `dashboard/app/actions/tickets.ts`

No unit tests — the Server Action is a thin orchestrator. It is verified via typecheck and manual testing in Task 11.

- [ ] **Step 1: Create Server Action**

Create `dashboard/app/actions/tickets.ts`:

```typescript
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

  let provider
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
```

- [ ] **Step 2: Typecheck**

```bash
cd dashboard && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/actions/tickets.ts
git commit -m "feat(dashboard): add fetchTickets Server Action"
```

---

## Task 10: CellDetail Client Component

**Files:**
- Create: `dashboard/app/components/CellDetail.tsx`

Verified via typecheck and visual inspection in Task 11.

- [ ] **Step 1: Create CellDetail component**

Create `dashboard/app/components/CellDetail.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { fetchTickets } from '@/app/actions/tickets'
import type { Ticket } from '@/lib/tickets'

export interface ClusterVersion {
  cluster: string
  version: string
}

interface Props {
  deployment: string
  currentCluster: string
  otherClusters: ClusterVersion[]
}

export default function CellDetail({ deployment, currentCluster, otherClusters }: Props) {
  const [compareCluster, setCompareCluster] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCompare(from: ClusterVersion, toVersion: string) {
    setCompareCluster(from.cluster)
    setTickets(null)
    setError(null)
    startTransition(async () => {
      const result = await fetchTickets(deployment, from.version, toVersion)
      if (result.error) {
        setError(result.error)
      } else {
        setTickets(result.tickets)
      }
    })
  }

  const currentVersion = otherClusters.find(c => c.cluster === currentCluster)?.version

  if (!currentVersion || otherClusters.filter(c => c.cluster !== currentCluster).length === 0) {
    return null
  }

  const comparableClusters = otherClusters.filter(c => c.cluster !== currentCluster)

  return (
    <div className="cell-detail">
      <div className="cell-detail-compare">
        <span className="cell-meta">tickets vs:</span>
        {comparableClusters.map(({ cluster, version }) => (
          <button
            key={cluster}
            className={`cluster-compare-btn${compareCluster === cluster ? ' active' : ''}`}
            onClick={() => handleCompare({ cluster, version }, currentVersion)}
          >
            {cluster}
          </button>
        ))}
      </div>

      {isPending && <div className="cell-meta">loading…</div>}

      {!isPending && error && (
        <div className="cell-detail-error cell-meta">{error}</div>
      )}

      {!isPending && tickets !== null && (
        <div className="cell-detail-tickets">
          {tickets.length === 0 ? (
            <span className="cell-meta">no tickets found</span>
          ) : (
            <ul className="ticket-list">
              {tickets.map(t => (
                <li key={t.key} className="ticket-item">
                  <strong className="ticket-key">{t.key}</strong>
                  {t.description && (
                    <span className="ticket-desc"> — {t.description.split('\n')[0]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd dashboard && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/components/CellDetail.tsx
git commit -m "feat(dashboard): add CellDetail client component"
```

---

## Task 11: DeploymentMatrix component + page.tsx wiring

**Files:**
- Create: `dashboard/app/components/DeploymentMatrix.tsx`
- Modify: `dashboard/app/page.tsx`

The main page currently is a Server Component that renders the full matrix inline. We extract a `DeploymentMatrix` Client Component that receives pre-computed, serialisable row data and manages expand state.

- [ ] **Step 1: Create DeploymentMatrix component**

Create `dashboard/app/components/DeploymentMatrix.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import CellDetail, { type ClusterVersion } from './CellDetail'

export interface CellData {
  statusClass: string
  statusText: string
  version: string
  replicasAvailable: number
  replicasDesired: number
  timestamp: string
  isStale: boolean
}

export interface RowData {
  key: string          // "namespace/deployment"
  deployment: string   // deployment name only (used for repo map lookup)
  hasRepoConfig: boolean
  cells: Record<string, CellData | null>  // cluster → data or null if missing
}

interface Props {
  clusters: string[]
  rows: RowData[]
}

export default function DeploymentMatrix({ clusters, rows }: Props) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  function toggleRow(key: string, hasRepo: boolean) {
    if (!hasRepo) return
    setExpandedRow(prev => (prev === key ? null : key))
  }

  return (
    <table className="matrix">
      <thead>
        <tr>
          <th>DEPLOYMENT</th>
          {clusters.map(c => <th key={c}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const isExpanded = expandedRow === row.key
          const allVersions: ClusterVersion[] = clusters.flatMap(c => {
            const cell = row.cells[c]
            return cell ? [{ cluster: c, version: cell.version }] : []
          })

          return (
            <React.Fragment key={row.key}>
              <tr
                onClick={() => toggleRow(row.key, row.hasRepoConfig)}
                className={row.hasRepoConfig ? 'row-clickable' : undefined}
              >
                <td className="service-name">{row.key}</td>
                {clusters.map(cluster => {
                  const cell = row.cells[cluster]
                  return (
                    <td key={`${row.key}-${cluster}`} className="matrix-cell-td">
                      {!cell ? (
                        <div className="cell missing">
                          <div className="cell-missing">— NO REPORT</div>
                        </div>
                      ) : (
                        <div className={`cell ${cell.statusClass}`}>
                          <div className="cell-header">
                            <span className={`cell-led ${cell.statusClass}`} />
                            <span className={`cell-badge ${cell.statusClass}`}>{cell.statusText}</span>
                          </div>
                          <div className={`cell-version${cell.isStale ? ' stale' : ''}`}>{cell.version}</div>
                          <div className="cell-meta">{cell.replicasAvailable}/{cell.replicasDesired} replicas</div>
                          <div className="cell-meta">{new Date(cell.timestamp).toLocaleString()}</div>
                          {cell.isStale && <div className="cell-meta">was: {cell.statusText}</div>}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={clusters.length + 1} className="detail-row">
                    {clusters.map(cluster => {
                      const cell = row.cells[cluster]
                      if (!cell) return null
                      return (
                        <div key={cluster} className="detail-cluster-section">
                          <span className="cell-meta detail-cluster-label">{cluster}</span>
                          <CellDetail
                            deployment={row.deployment}
                            currentCluster={cluster}
                            otherClusters={allVersions}
                          />
                        </div>
                      )
                    })}
                  </td>
                </tr>
              )}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Update page.tsx**

Replace the `<table className="matrix">` block (lines 130–170 of `dashboard/app/page.tsx`) with a `DeploymentMatrix` import and data computation. The full updated `page.tsx`:

```tsx
import Filters from './components/Filters';
import DeploymentMatrix, { type RowData, type CellData } from './components/DeploymentMatrix';
import { getConfig } from '@/lib/config';
import { snapshot } from '@/lib/store';
import type { Observation } from '@/lib/types';

function isStale(timestamp: string, thresholdSeconds: number): boolean {
  const ageMs = Date.now() - Date.parse(timestamp);
  return ageMs > thresholdSeconds * 1000;
}

function statusClass(obs?: Observation, stale = false): string {
  if (!obs) return 'missing';
  if (stale) return 'stale';
  if (obs.health === 'OK') return 'ok';
  if (obs.health === 'ERROR') return 'error';
  if (obs.health === 'UNKNOWN') return 'unknown';
  return 'degraded';
}

function statusText(obs?: Observation, stale = false): string {
  if (!obs) return 'MISSING';
  if (stale) return 'STALE';
  return obs.health;
}

function parseRepoMap(raw: string): Set<string> {
  const deployments = new Set<string>()
  for (const entry of raw.split(',')) {
    const eq = entry.indexOf('=')
    if (eq !== -1) deployments.add(entry.slice(0, eq).trim())
  }
  return deployments
}

export default function Home({
  searchParams
}: {
  searchParams: { namespace?: string; q?: string };
}) {
  const config = getConfig();
  const data = snapshot();
  const configuredDeployments = parseRepoMap(process.env.FLEETBOARD_REPO_MAP ?? '')

  const rowKeys = new Set<string>();
  const namespaces = new Set<string>();

  for (const clusterMap of data.values()) {
    for (const [key, obs] of clusterMap.entries()) {
      rowKeys.add(key);
      namespaces.add(obs.namespace);
    }
  }

  const nsFilter = (searchParams.namespace ?? '').trim();
  const qFilter = (searchParams.q ?? '').trim().toLowerCase();

  const filteredKeys = Array.from(rowKeys)
    .filter((key) => {
      const [ns, deployment] = key.split('/');
      if (nsFilter && ns !== nsFilter) return false;
      if (qFilter && !deployment.toLowerCase().includes(qFilter)) return false;
      return true;
    })
    .sort();

  let okCount = 0;
  let degradedCount = 0;
  let errorCount = 0;
  let unknownCount = 0;
  let staleCount = 0;

  const rows: RowData[] = filteredKeys.map(key => {
    const [, deployment] = key.split('/')
    const cells: Record<string, CellData | null> = {}

    for (const cluster of config.clusters) {
      const obs = data.get(cluster)?.get(key)
      if (!obs) {
        cells[cluster] = null
        continue
      }
      const stale = isStale(obs.timestamp, config.staleAfterSeconds)
      if (obs.health === 'OK') okCount += 1;
      if (obs.health === 'DEGRADED') degradedCount += 1;
      if (obs.health === 'ERROR') errorCount += 1;
      if (obs.health === 'UNKNOWN') unknownCount += 1;
      if (stale) staleCount += 1;
      cells[cluster] = {
        statusClass: statusClass(obs, stale),
        statusText: statusText(obs, stale),
        version: obs.version,
        replicasAvailable: obs.replicasAvailable,
        replicasDesired: obs.replicasDesired,
        timestamp: obs.timestamp,
        isStale: stale,
      }
    }

    return {
      key,
      deployment,
      hasRepoConfig: configuredDeployments.has(deployment),
      cells,
    }
  })

  return (
    <div className="cmd-shell">
      <header className="cmd-header">
        <div className="cmd-brand">
          <div className="cmd-brand-indicator" />
          <div>
            <div className="cmd-brand-name">FLEETBOARD</div>
            <div className="cmd-brand-sub">DEPLOYMENT CONTROL MATRIX</div>
          </div>
        </div>
        <div className="cmd-header-meta">
          <div className="cmd-meta-item">
            <span className="cmd-meta-label">CLUSTERS</span>
            <span className="cmd-meta-value">{config.clusters.length}</span>
          </div>
          <div className="cmd-meta-item">
            <span className="cmd-meta-label">SERVICES</span>
            <span className="cmd-meta-value">{filteredKeys.length}</span>
          </div>
        </div>
      </header>

      <main className="cmd-main">
        <div className="sys-status">
          <div className="sys-stat ok">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">OK</span>
            <strong className="sys-stat-val">{okCount}</strong>
          </div>
          <div className="sys-stat degraded">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">DEGRADED</span>
            <strong className="sys-stat-val">{degradedCount}</strong>
          </div>
          <div className="sys-stat error">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">ERROR</span>
            <strong className="sys-stat-val">{errorCount}</strong>
          </div>
          <div className="sys-stat unknown">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">UNKNOWN</span>
            <strong className="sys-stat-val">{unknownCount}</strong>
          </div>
          <div className="sys-stat stale">
            <span className="sys-stat-led" />
            <span className="sys-stat-label">STALE</span>
            <strong className="sys-stat-val">{staleCount}</strong>
          </div>
        </div>

        <Filters namespaces={Array.from(namespaces).sort()} />

        <div className="matrix-frame">
          <span className="corner-tl" aria-hidden="true" />
          <div className="matrix-wrap">
            <DeploymentMatrix clusters={config.clusters} rows={rows} />
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd dashboard && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify dev server starts**

```bash
cd dashboard
FLEETBOARD_CLUSTERS=dev,staging,prod \
FLEETBOARD_API_KEY_DEV=localkey \
FLEETBOARD_API_KEY_STAGING=localkey \
FLEETBOARD_API_KEY_PROD=localkey \
npm run dev
```

Expected: Next.js starts on port 3000, dashboard loads at `http://localhost:3000`.

- [ ] **Step 5: Manual smoke test**

With the dev server running, send a test ingest to populate data, then verify clicks work:

```bash
# Seed two versions so the delta has something to compare
curl -s -X POST http://localhost:3000/api/ingest \
  -H "X-API-Key: localkey" \
  -H "Content-Type: application/json" \
  -d '{"cluster":"dev","observations":[{"cluster":"dev","namespace":"demo","deployment":"api","image":"myorg/api:2.4.1","version":"2.4.1","replicasDesired":2,"replicasAvailable":2,"replicasUpdated":2,"health":"OK","source":"image","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}]}'

curl -s -X POST http://localhost:3000/api/ingest \
  -H "X-API-Key: localkey" \
  -H "Content-Type: application/json" \
  -d '{"cluster":"prod","observations":[{"cluster":"prod","namespace":"demo","deployment":"api","image":"myorg/api:2.3.0","version":"2.3.0","replicasDesired":2,"replicasAvailable":2,"replicasUpdated":2,"health":"OK","source":"image","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}]}'
```

Verify in browser: `demo/api` row appears, clicking it shows the expand row with cluster buttons.

- [ ] **Step 6: Commit**

```bash
git add dashboard/app/components/DeploymentMatrix.tsx dashboard/app/page.tsx
git commit -m "feat(dashboard): wire DeploymentMatrix with expand + CellDetail"
```

---

## Task 12: Helm chart updates

**Files:**
- Modify: `dashboard/helm/fleetboard-dashboard/values.yaml`
- Modify: `dashboard/helm/fleetboard-dashboard/templates/secret.yaml`
- Modify: `dashboard/helm/fleetboard-dashboard/templates/deployment.yaml`

- [ ] **Step 1: Add new values to values.yaml**

In `dashboard/helm/fleetboard-dashboard/values.yaml`, append after the `auth:` block:

```yaml
# Map of Deployment name → git provider and repository.
# Format per entry: "<deployment-name>: <provider>:<owner>/<repo>"
# Supported providers: github, gitlab, bitbucket
# Example:
#   repoMap:
#     api: "github:myorg/api"
#     worker: "gitlab:myorg/worker"
repoMap: {}

# Optional git tag prefix prepended to the version string to form a tag name.
# If unset, FleetBoard tries "release/{version}", "v{version}", "{version}" in order.
# Example: "release/" to match tags like "release/2.4.1"
tagPrefix: ""

# Git provider authentication tokens.
# Sensitive — inject via --set, do not store in plain values files.
gitProviders:
  github:
    token: ""
  gitlab:
    token: ""
  bitbucket:
    token: ""
    username: ""
```

- [ ] **Step 2: Add provider tokens to secret.yaml**

In `dashboard/helm/fleetboard-dashboard/templates/secret.yaml`, add after the `auth` block:

```yaml
  {{- if .Values.gitProviders.github.token }}
  FLEETBOARD_GITHUB_TOKEN: {{ .Values.gitProviders.github.token | quote }}
  {{- end }}
  {{- if .Values.gitProviders.gitlab.token }}
  FLEETBOARD_GITLAB_TOKEN: {{ .Values.gitProviders.gitlab.token | quote }}
  {{- end }}
  {{- if .Values.gitProviders.bitbucket.token }}
  FLEETBOARD_BITBUCKET_TOKEN: {{ .Values.gitProviders.bitbucket.token | quote }}
  FLEETBOARD_BITBUCKET_USERNAME: {{ .Values.gitProviders.bitbucket.username | quote }}
  {{- end }}
```

- [ ] **Step 3: Add env vars to deployment.yaml**

In `dashboard/helm/fleetboard-dashboard/templates/deployment.yaml`, add after the `FLEETBOARD_STALE_AFTER_SECONDS` env entry:

```yaml
            {{- if .Values.repoMap }}
            - name: FLEETBOARD_REPO_MAP
              value: "{{- $entries := list -}}{{- range $k, $v := .Values.repoMap -}}{{- $entries = append $entries (printf \"%s=%s\" $k $v) -}}{{- end -}}{{ join \",\" $entries }}"
            {{- end }}
            {{- if .Values.tagPrefix }}
            - name: FLEETBOARD_TAG_PREFIX
              value: {{ .Values.tagPrefix | quote }}
            {{- end }}
```

- [ ] **Step 4: Verify helm template renders cleanly**

```bash
helm template test dashboard/helm/fleetboard-dashboard \
  --set "clusters[0]=dev" \
  --set "clusters[1]=prod" \
  --set "apiKeys.dev=key1" \
  --set "apiKeys.prod=key2" \
  --set "repoMap.api=github:myorg/api" \
  --set "gitProviders.github.token=ghp_test"
```

Expected: rendered YAML contains `FLEETBOARD_REPO_MAP: "api=github:myorg/api"` and `FLEETBOARD_GITHUB_TOKEN` in the Secret.

- [ ] **Step 5: Commit**

```bash
git add dashboard/helm/fleetboard-dashboard/values.yaml \
        dashboard/helm/fleetboard-dashboard/templates/secret.yaml \
        dashboard/helm/fleetboard-dashboard/templates/deployment.yaml
git commit -m "feat(helm): add repoMap and gitProviders values for ticket visibility"
```

---

## Task 13: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Ticket Visibility section to README.md**

After the `## Discovery modes` section and before `## Documentation`, add:

```markdown
## Ticket visibility

Click any matrix cell to see which Jira tickets are included in that cluster's deployed version compared to another cluster — useful for answering "what's in staging that hasn't hit prod yet?"

### How it works

FleetBoard reads git commit history between two version tags using your source control provider's API, then extracts Jira-style ticket keys (`[A-Z]+-[0-9]+`) from commit messages — the same logic as the [release-notes](https://gitlab.hc.gamomat.io/grgs/tools/release-notes) tool.

### Configuration

Map each Deployment name to its repository:

```bash
# Local dev
FLEETBOARD_REPO_MAP=api=github:myorg/api,worker=gitlab:myorg/worker
FLEETBOARD_GITHUB_TOKEN=ghp_...
FLEETBOARD_GITLAB_TOKEN=glpat_...

# Optional: pin the tag format (otherwise tries release/{v}, v{v}, {v})
FLEETBOARD_TAG_PREFIX=release/
```

**Helm:**

```yaml
repoMap:
  api: "github:myorg/api"
  worker: "gitlab:myorg/worker"

tagPrefix: "release/"   # optional

gitProviders:
  github:
    token: ""           # inject via --set
  gitlab:
    token: ""
  bitbucket:
    token: ""
    username: ""
```

Supported providers: `github`, `gitlab`, `bitbucket`.

Deployments without a `repoMap` entry are not clickable — no visual change to the matrix.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document ticket visibility feature"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Provider strategy: GitHub/GitLab/Bitbucket | Tasks 5, 6, 7 |
| `GitProvider` interface | Task 4 |
| `extractTickets` utility | Task 2 |
| `resolveTag` utility | Task 3 |
| Provider factory | Task 8 |
| Server Action `fetchTickets` | Task 9 |
| `CellDetail` Client Component | Task 10 |
| `DeploymentMatrix` with expand state | Task 11 |
| `page.tsx` wiring | Task 11 |
| Config: `FLEETBOARD_REPO_MAP`, `FLEETBOARD_TAG_PREFIX`, tokens | Task 9 (env read) + Task 12 (Helm) |
| Helm: `values.yaml`, `secret.yaml`, `deployment.yaml` | Task 12 |
| README | Task 13 |
| Cells without repo config are not clickable | Task 11 |
| Graceful error handling (no repo, bad tag, API failure) | Task 9 |
