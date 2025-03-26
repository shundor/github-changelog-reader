/**
 * Unit tests for src/rss-feed.ts
 */
import { jest } from '@jest/globals'
import * as https from 'https'
import { EventEmitter } from 'events'
import { fetchChangelogFeed, ChangelogEntry } from '../src/rss-feed.js'

// Mock the https module
jest.mock('https', () => ({
  get: jest.fn()
}))

describe('rss-feed.ts', () => {
  let mockResponse: EventEmitter
  let mockRequest: EventEmitter

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
    
    // Create mock response and request objects
    mockResponse = new EventEmitter()
    mockResponse.statusCode = 200
    mockRequest = new EventEmitter()
    
    // Mock https.get to return our mock request and trigger our mock response
    const mockGet = https.get as jest.Mock
    mockGet.mockImplementation((url, callback) => {
      callback(mockResponse)
      return mockRequest
    })
  })

  it('fetches and parses RSS feed successfully', async () => {
    // Create a promise to wait for the async function to complete
    const fetchPromise = fetchChangelogFeed('https://example.com/feed')
    
    // Emit data and end events on the response
    mockResponse.emit('data', Buffer.from(`
      <rss version="2.0">
        <channel>
          <title>GitHub Changelog</title>
          <item>
            <title>Test Item 1</title>
            <link>https://example.com/1</link>
            <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
            <content:encoded><![CDATA[Test content 1]]></content:encoded>
            <guid>item-1</guid>
          </item>
          <item>
            <title>Test Item 2</title>
            <link>https://example.com/2</link>
            <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
            <description>Test description 2</description>
            <guid>item-2</guid>
          </item>
        </channel>
      </rss>
    `))
    mockResponse.emit('end')
    
    // Wait for the promise to resolve
    const entries = await fetchPromise
    
    // Check the result
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      title: 'Test Item 1',
      link: 'https://example.com/1',
      pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT',
      content: 'Test content 1',
      guid: 'item-1'
    })
    expect(entries[1]).toEqual({
      title: 'Test Item 2',
      link: 'https://example.com/2',
      pubDate: 'Tue, 02 Jan 2024 12:00:00 GMT',
      content: 'Test description 2',
      guid: 'item-2'
    })
  })

  it('handles HTTP error status code', async () => {
    // Set error status code
    mockResponse.statusCode = 404
    
    // Create the promise
    const fetchPromise = fetchChangelogFeed('https://example.com/feed')
    
    // Expect the promise to reject
    await expect(fetchPromise).rejects.toThrow('Failed to fetch feed: 404')
  })

  it('handles network errors', async () => {
    // Create the promise
    const fetchPromise = fetchChangelogFeed('https://example.com/feed')
    
    // Emit an error
    mockResponse.emit('error', new Error('Network error'))
    
    // Expect the promise to reject
    await expect(fetchPromise).rejects.toThrow('Network error')
  })

  it('handles invalid RSS feed structure', async () => {
    // Create a promise to wait for the async function to complete
    const fetchPromise = fetchChangelogFeed('https://example.com/feed')
    
    // Emit data with invalid RSS structure
    mockResponse.emit('data', Buffer.from('<invalid>XML</invalid>'))
    mockResponse.emit('end')
    
    // Expect the promise to reject
    await expect(fetchPromise).rejects.toThrow('Failed to parse RSS feed')
  })
})
