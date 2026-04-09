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
