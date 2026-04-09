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
