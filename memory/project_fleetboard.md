---
name: FleetBoard project context
description: Context about the FleetBoard project - what it is, current state, key decisions
type: project
---

FleetBoard is a multi-cluster Kubernetes deployment visibility tool the user is building — originally for a client, now being generified for public GitHub.

**Why:** Shows which version of each Deployment is running across clusters and whether rollouts are healthy. No database, stateless dashboard.

**Structure:** Monorepo at `/Users/noahispas/Desktop/workspace/gitrepo_private/FleetBoard` with `dashboard/` (Next.js 14), `collector/` (Node.js), `docs/`, `kind/`, `scripts/`.

**Key decisions made:**
- Monorepo over 3-repo split
- Four discovery modes (`label`/`namespace`/`selector`/`all`) via `DISCOVERY_MODE` env var — non-invasive by default
- Full snapshot replacement in store — deleted deployments disappear within one scrape interval
- Stale cells render amber/dimmed (not green) so operators notice
- Kubernetes label domain: `fleetboard.io/`

**How to apply:** Read CLAUDE.md and PROJECT_STATUS.md at repo root before making any changes. Typechecks pass on both components.
