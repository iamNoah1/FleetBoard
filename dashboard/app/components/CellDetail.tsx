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
