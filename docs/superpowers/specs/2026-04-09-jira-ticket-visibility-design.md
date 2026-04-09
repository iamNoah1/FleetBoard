# Design: Jira Ticket Visibility in FleetBoard

**Date:** 2026-04-09  
**Status:** Approved

## Problem

FleetBoard shows which version of each deployment is running per cluster, but gives no insight into *what changed*. Operators need to know which Jira tickets are contained in a given deployment version — and which tickets are "ahead" in one cluster vs another.

## Goals

- Show Jira tickets included in a deployed version
- Show cluster delta: tickets present in cluster A but not yet in cluster B
- Support GitHub, GitLab, and Bitbucket as ticket sources
- Zero changes to the collector or the `Observation` model
- Tokens never exposed to the browser

## Out of scope

- Jira API integration (ticket titles/status from Jira) — ticket keys only
- Automatic environment progression tracking
- Caching layer (not needed for MVP)

---

## Config

### New environment variables

All new variables are dashboard-only.

| Variable | Description | Example |
|---|---|---|
| `FLEETBOARD_REPO_MAP` | Comma-separated `deployment=provider:owner/repo` entries | `api=github:myorg/api,worker=gitlab:myorg/worker` |
| `FLEETBOARD_TAG_PREFIX` | Prefix prepended to the version string to form a git tag. Tries `release/{v}`, `v{v}`, `{v}` in order if unset. | `release/` |
| `FLEETBOARD_GITHUB_TOKEN` | GitHub PAT with `repo` scope | `ghp_...` |
| `FLEETBOARD_GITLAB_TOKEN` | GitLab personal access token with `read_api` scope | `glpat_...` |
| `FLEETBOARD_BITBUCKET_TOKEN` | Bitbucket app password | |
| `FLEETBOARD_BITBUCKET_USERNAME` | Bitbucket username (required with token) | |

The deployment name in `FLEETBOARD_REPO_MAP` matches `obs.deployment` (the Kubernetes Deployment name, without namespace).

### Helm values additions

```yaml
# Map of deployment name → git provider and repo.
# Format: "<deployment>=<provider>:<owner>/<repo>"
# Supported providers: github, gitlab, bitbucket
# Example:
#   repoMap:
#     api: "github:myorg/api"
#     worker: "gitlab:myorg/worker"
repoMap: {}

# Optional git tag prefix. If unset, FleetBoard tries release/{v}, v{v}, {v}.
tagPrefix: ""

# Git provider tokens. Sensitive — inject via --set, do not store in plain values files.
gitProviders:
  github:
    token: ""
  gitlab:
    token: ""
  bitbucket:
    token: ""
    username: ""
```

These are added to the existing `Secret` template alongside `apiKeys`.

---

## Architecture

### Provider strategy

A `GitProvider` interface abstracts the "get commit messages between two tags" operation:

```typescript
// dashboard/lib/providers/types.ts
export interface GitProvider {
  getCommitMessages(repo: string, from: string, to: string): Promise<string[]>
}

export interface Ticket {
  key: string        // e.g. "MYPROJ-123"
  description: string  // commit subject(s) referencing this ticket
}
```

Three implementations:

| File | Provider | API used |
|---|---|---|
| `dashboard/lib/providers/github.ts` | GitHub | `GET /repos/{owner}/{repo}/compare/{from}...{to}` |
| `dashboard/lib/providers/gitlab.ts` | GitLab | `GET /projects/{id}/repository/compare?from={from}&to={to}` |
| `dashboard/lib/providers/bitbucket.ts` | Bitbucket | `GET /repositories/{workspace}/{slug}/commits` filtered by tag range |

A factory (`dashboard/lib/providers/factory.ts`) parses the `provider:owner/repo` string from config and returns the correct implementation with the token injected.

### Ticket extraction

```typescript
// dashboard/lib/tickets.ts
const TICKET_RE = /[A-Z]+-[0-9]+/g

export function extractTickets(messages: string[]): Ticket[]
```

Identical logic to the `release-notes` Go tool: scan commit subjects for `[A-Z]+-[0-9]+`, deduplicate, collect descriptions. Pure function, easy to test.

### Tag resolution

```typescript
// dashboard/lib/tags.ts
export function resolveTag(version: string, prefix?: string): string[]
```

Returns candidate tag strings to try in order. If `FLEETBOARD_TAG_PREFIX` is set, returns `[prefix + version]`. Otherwise returns `["release/" + version, "v" + version, version]`. The provider tries each until one resolves (HTTP 200), or returns an empty ticket list with a `tagNotFound` flag.

### Server Action

```typescript
// dashboard/app/actions/tickets.ts
'use server'

export async function fetchTickets(
  deployment: string,
  fromVersion: string,
  toVersion: string
): Promise<{ tickets: Ticket[]; error?: string }>
```

Flow:
1. Look up `deployment` in `FLEETBOARD_REPO_MAP` — if not found, return `{ tickets: [], error: 'no repo configured' }`
2. Parse `provider:owner/repo`, get token from env
3. Resolve tag strings for `fromVersion` and `toVersion`
4. Call `provider.getCommitMessages(repo, fromTag, toTag)`
5. Run `extractTickets(messages)`
6. Return result

Errors are returned as `{ tickets: [], error: '...' }` — never thrown — so the UI can degrade gracefully.

---

## UI changes

### Cell interaction

The matrix cells in `app/page.tsx` become clickable. Clicking a cell toggles an inline detail panel below that row (or as a popover — to be decided during implementation). The panel is a **Client Component** (`app/components/CellDetail.tsx`).

### Cluster delta (primary feature)

FleetBoard only stores the *current* version per cluster — there is no historical data. The ticket view therefore always shows a **cluster-to-cluster delta**: which Jira tickets are present in cluster A's version but not in cluster B's.

The detail panel renders a **"compare with"** dropdown listing the other known clusters. When a target cluster is selected, it calls `fetchTickets(deployment, targetCluster_version, thisCluster_version)` and shows the diff. The dashboard already holds all versions in memory — no new data fetching needed.

### Absolute comparison (stretch goal, not in MVP)

Showing tickets relative to the predecessor git tag (e.g., what's new in `2.4.1` vs `2.4.0`) requires an extra provider API call to resolve the previous tag. This is out of scope for the initial implementation but the architecture supports it: `fetchTickets` already takes arbitrary `from`/`to` version strings.

### Fallback behavior

- If `FLEETBOARD_REPO_MAP` has no entry for the deployment: cell is not clickable (no visual change — avoids misleading UX)
- If provider API call fails or tag not found: show inline error message in the panel
- If no tickets found between two tags: show "no tickets found" (not an error)

---

## Files

### New files

| File | Purpose |
|---|---|
| `dashboard/lib/providers/types.ts` | `GitProvider` interface, `Ticket` type |
| `dashboard/lib/providers/github.ts` | GitHub implementation |
| `dashboard/lib/providers/gitlab.ts` | GitLab implementation |
| `dashboard/lib/providers/bitbucket.ts` | Bitbucket implementation |
| `dashboard/lib/providers/factory.ts` | Provider factory |
| `dashboard/lib/tickets.ts` | `extractTickets()` utility |
| `dashboard/lib/tags.ts` | `resolveTag()` utility |
| `dashboard/app/actions/tickets.ts` | Server Action |
| `dashboard/app/components/CellDetail.tsx` | Client Component for ticket panel |

### Modified files

| File | Change |
|---|---|
| `dashboard/lib/config.ts` | Parse `FLEETBOARD_REPO_MAP`, `FLEETBOARD_TAG_PREFIX`, provider tokens |
| `dashboard/lib/types.ts` | Add `Ticket` re-export (or keep in providers/types.ts) |
| `dashboard/app/page.tsx` | Make cells clickable, render `CellDetail` |
| `dashboard/helm/fleetboard-dashboard/values.yaml` | Add `repoMap`, `tagPrefix`, `gitProviders` |
| `dashboard/helm/fleetboard-dashboard/templates/secret.yaml` | Add provider tokens to Secret |
| `dashboard/helm/fleetboard-dashboard/templates/deployment.yaml` | Inject `FLEETBOARD_REPO_MAP`, `FLEETBOARD_TAG_PREFIX` as env vars |
| `README.md` | Document the feature |

---

## Documentation updates

### README.md

Add a "Ticket visibility" section after "Discovery modes":

- Explain the feature (click any cell to see Jira tickets)
- Show the Helm values snippet for `repoMap` and `gitProviders`
- Document the `FLEETBOARD_REPO_MAP` env var format for local dev

### Helm chart

`values.yaml` additions are documented with inline comments matching the existing style.

---

## Security

- Provider tokens live in the Kubernetes `Secret` alongside existing API keys — same injection pattern
- Tokens are read from `process.env` inside the Server Action, never passed to the browser
- The Server Action is not an HTTP endpoint; it is a server-side function invoked via Next.js RPC — not directly reachable from outside
- If the dashboard is behind HTTP Basic Auth (existing feature), ticket lookups are implicitly protected
