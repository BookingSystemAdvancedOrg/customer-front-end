import { afterEach, describe, expect, it } from 'vitest'
import { isDevHost, pickLocation, siteQuery } from './site'
import { siteConfig } from '../test/siteData'

afterEach(() => sessionStorage.clear())

describe('isDevHost', () => {
  it.each([
    ['localhost', true],
    ['d3kaislpxcbglq.cloudfront.net', true],
    ['127.0.0.1', true],
    ['www.roma.se', false],
    ['roma.bokning.se', false],
  ])('%s -> %s', (host, dev) => {
    expect(isDevHost(host)).toBe(dev)
  })
})

describe('siteQuery', () => {
  it('maps a real domain by host (lowercase, never a slug)', () => {
    expect(siteQuery('WWW.Roma.se', '?restaurang=other', 'dev')).toBe('host=www.roma.se')
  })

  it('takes ?restaurang= on dev hosts and remembers it for the visit', () => {
    expect(siteQuery('x.cloudfront.net', '?restaurang=Roma', undefined)).toBe('slug=roma')
    expect(siteQuery('x.cloudfront.net', '', undefined)).toBe('slug=roma')
  })

  it('falls back to the build-time dev slug, ignores invalid input', () => {
    expect(siteQuery('localhost', '', 'testkrogen')).toBe('slug=testkrogen')
    expect(siteQuery('localhost', '?restaurang=../evil', 'testkrogen')).toBe('slug=testkrogen')
    expect(siteQuery('localhost', '', undefined)).toBeNull()
  })
})

describe('pickLocation', () => {
  it('keeps a stored location of this restaurant, else the first', () => {
    const config = siteConfig()
    config.locations.push({ ...config.locations[0], locationId: 'loc-2', name: 'Två' })
    expect(pickLocation(config, 'loc-2')?.locationId).toBe('loc-2')
    expect(pickLocation(config, 'someone-else')?.locationId).toBe('loc-1')
  })
})
