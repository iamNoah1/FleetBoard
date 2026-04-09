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
