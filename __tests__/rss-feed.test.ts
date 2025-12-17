import { fetchChangelogFeed } from '../src/rss-feed'
import * as https from 'https'

// Mock https module
jest.mock('https')

describe('RSS Feed', () => {
  let mockRequest: any
  let mockResponse: any

  beforeEach(() => {
    // Create simple mock objects
    mockResponse = {
      statusCode: 200,
      on: jest.fn((event, callback) => {
        if (event === 'data') {
          mockResponse.dataCallback = callback
        } else if (event === 'end') {
          mockResponse.endCallback = callback
        } else if (event === 'error') {
          mockResponse.errorCallback = callback
        }
      })
    }

    mockRequest = {
      on: jest.fn(),
      end: jest.fn(),
      setTimeout: jest.fn((ms, callback) => {
        mockRequest.timeoutCallback = callback
      })
    }

    // Mock https.get to call the callback with the mock response
    ;(https.get as jest.Mock).mockImplementation((url, callback) => {
      callback(mockResponse)
      return mockRequest
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('successfully fetches and parses RSS feed', async () => {
    const mockXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Test Entry</title>
            <link>https://example.com/entry</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <content:encoded><![CDATA[Test content]]></content:encoded>
            <guid>123</guid>
          </item>
        </channel>
      </rss>
    `

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    const result = await promise
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      title: 'Test Entry',
      link: 'https://example.com/entry',
      pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT',
      content: 'Test content',
      guid: '123'
    })
  })

  test('handles feed with multiple items', async () => {
    const mockXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Entry 1</title>
            <link>https://example.com/1</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <description>Description 1</description>
            <guid>1</guid>
          </item>
          <item>
            <title>Entry 2</title>
            <link>https://example.com/2</link>
            <pubDate>Mon, 02 Jan 2024 12:00:00 GMT</pubDate>
            <description>Description 2</description>
            <guid>2</guid>
          </item>
        </channel>
      </rss>
    `

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    const result = await promise
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('Entry 1')
    expect(result[1].title).toBe('Entry 2')
  })

  test('handles complex guid format', async () => {
    const mockXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Test Entry</title>
            <link>https://example.com/entry</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <description>Test description</description>
            <guid isPermaLink="true">https://example.com/guid/123</guid>
          </item>
        </channel>
      </rss>
    `

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    const result = await promise
    expect(result[0].guid).toBe('https://example.com/guid/123')
  })

  test('handles network errors', async () => {
    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.errorCallback(new Error('Network error'))

    await expect(promise).rejects.toThrow('Network error')
  })

  test('handles invalid status code', async () => {
    mockResponse.statusCode = 404
    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')

    await expect(promise).rejects.toThrow('Failed to fetch feed: 404')
  })

  test('handles invalid XML', async () => {
    const mockXml =
      'Some text before XML <?xml version="1.0" encoding="UTF-8"?><rss></rss>'

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    await expect(promise).rejects.toThrow('Failed to parse RSS feed')
  })

  test('extracts changelog-type and changelog-label categories', async () => {
    const mockXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Test Entry</title>
            <link>https://example.com/entry</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <content:encoded><![CDATA[Test content]]></content:encoded>
            <guid>123</guid>
            <category domain="changelog-type"><![CDATA[Improvement]]></category>
            <category domain="changelog-label"><![CDATA[copilot]]></category>
          </item>
        </channel>
      </rss>
    `

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    const result = await promise
    expect(result).toHaveLength(1)
    expect(result[0].changelogType).toBe('Improvement')
    expect(result[0].changelogLabel).toBe('copilot')
  })

  test('handles items without categories', async () => {
    const mockXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Test Entry</title>
            <link>https://example.com/entry</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <content:encoded><![CDATA[Test content]]></content:encoded>
            <guid>123</guid>
          </item>
        </channel>
      </rss>
    `

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    const result = await promise
    expect(result).toHaveLength(1)
    expect(result[0].changelogType).toBeUndefined()
    expect(result[0].changelogLabel).toBeUndefined()
  })

  test('handles items with only one category', async () => {
    const mockXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Test Entry</title>
            <link>https://example.com/entry</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <content:encoded><![CDATA[Test content]]></content:encoded>
            <guid>123</guid>
            <category domain="changelog-type"><![CDATA[Feature]]></category>
          </item>
        </channel>
      </rss>
    `

    const promise = fetchChangelogFeed('https://github.blog/changelog/feed/')
    mockResponse.dataCallback(Buffer.from(mockXml))
    mockResponse.endCallback()

    const result = await promise
    expect(result).toHaveLength(1)
    expect(result[0].changelogType).toBe('Feature')
    expect(result[0].changelogLabel).toBeUndefined()
  })
})
