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
