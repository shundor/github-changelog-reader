import * as core from '@actions/core'
import * as https from 'https'
import { Parser } from 'xml2js'

export interface ChangelogEntry {
  title: string
  link: string
  pubDate: string
  content: string
  guid: string
  changelogType?: string
  changelogLabel?: string
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
  category?:
    | Array<{ _: string; $: { domain?: string } }>
    | { _: string; $: { domain?: string } }
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

// HTML entity map for decoding
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

// Regex pattern for matching HTML entities
const HTML_ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39);/g

// Special case words that should retain specific capitalization
const SPECIAL_CASE_WORDS: Record<string, string> = {
  github: 'GitHub',
  api: 'API',
  apis: 'APIs',
  oauth: 'OAuth',
  saml: 'SAML',
  cli: 'CLI',
  cicd: 'CI/CD'
}

/**
 * Normalizes a changelog label to title case.
 * Decodes HTML entities and handles special capitalizations for proper nouns and acronyms.
 */
function normalizeLabelCase(label: string): string {
  // Decode HTML entities using a single regex replace with fallback
  const decoded = label.replace(
    HTML_ENTITY_PATTERN,
    (match) => HTML_ENTITIES[match] || match
  )

  // Split by whitespace and convert to title case
  return decoded
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lowerWord = word.toLowerCase()
      // Check if it's a special case
      if (SPECIAL_CASE_WORDS[lowerWord]) {
        return SPECIAL_CASE_WORDS[lowerWord]
      }
      // Otherwise, capitalize first letter, lowercase the rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
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

    return items.map((item: RssItem) => {
      // Extract categories
      let changelogType: string | undefined
      let changelogLabel: string | undefined

      if (item.category) {
        const categories = Array.isArray(item.category)
          ? item.category
          : [item.category]

        for (const cat of categories) {
          if (cat.$ && cat.$.domain === 'changelog-type') {
            changelogType = cat._
          } else if (cat.$ && cat.$.domain === 'changelog-label') {
            changelogLabel = normalizeLabelCase(cat._)
          }
        }
      }

      return {
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        content: item['content:encoded'] || item.description || '',
        guid:
          typeof item.guid === 'object' && item.guid._
            ? item.guid._
            : String(item.guid),
        changelogType,
        changelogLabel
      }
    })
  } catch (error) {
    core.warning(`Error parsing RSS feed: ${error}`)
    throw new Error(`Failed to parse RSS feed: ${error}`)
  }
}
