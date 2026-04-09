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
