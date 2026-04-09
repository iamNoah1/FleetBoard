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
