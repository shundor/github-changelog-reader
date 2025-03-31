import * as core from '@actions/core'
import * as https from 'https'
import { Parser } from 'xml2js'

export interface ChangelogEntry {
  title: string
  link: string
  pubDate: string
  content: string
  guid: string
}

// Define interfaces for RSS structure
interface RssGuid {
  _: string
  [key: string]: unknown
}

interface RssItem {
  title: string
  link: string
  pubDate: string
  description?: string
  'content:encoded'?: string
  guid: string | RssGuid
  [key: string]: unknown
}

interface RssChannel {
  item: RssItem[] | RssItem
  [key: string]: unknown
}

interface RssFeed {
  rss: {
    channel: RssChannel
    [key: string]: unknown
  }
}

export async function fetchChangelogFeed(
  feedUrl: string
): Promise<ChangelogEntry[]> {
  console.log(`fetchChangelogFeed called with URL: ${feedUrl}`)
  console.trace('fetchChangelogFeed stack trace')
  const xml = await fetchXml(feedUrl)
  return parseRssFeed(xml)
}

function fetchXml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch feed: ${res.statusCode}`))
        return
      }

      const data: Buffer[] = []

      res.on('data', (chunk) => {
        data.push(chunk)
      })

      res.on('end', () => {
        const xml = Buffer.concat(data).toString()
        resolve(xml)
      })

      res.on('error', (err) => {
        reject(err)
      })
    })

    // Add timeout handler to prevent hanging requests
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Request timed out after 10 seconds'))
    })

    // Handle request-level errors
    req.on('error', (err) => {
      reject(err)
    })

    // Ensure the request is completed
    req.end()
  })
}

async function parseRssFeed(xml: string): Promise<ChangelogEntry[]> {
  try {
    const parser = new Parser({
      explicitArray: false,
      trim: true
    })

    const result = (await parser.parseStringPromise(xml)) as RssFeed

    if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
      throw new Error('Invalid RSS feed structure')
    }

    const items = Array.isArray(result.rss.channel.item)
      ? result.rss.channel.item
      : [result.rss.channel.item]

    return items.map((item: RssItem) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item['content:encoded'] || item.description || '',
      guid:
        typeof item.guid === 'object' && item.guid._
          ? item.guid._
          : String(item.guid)
    }))
  } catch (error) {
    core.warning(`Error parsing RSS feed: ${error}`)
    throw new Error(`Failed to parse RSS feed: ${error}`)
  }
}
