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

export async function fetchChangelogFeed(feedUrl: string): Promise<ChangelogEntry[]> {
  const xml = await fetchXml(feedUrl)
  return parseRssFeed(xml)
}

function fetchXml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch feed: ${res.statusCode}`))
        return
      }
      
      const data: Buffer[] = []
      
      res.on('data', chunk => {
        data.push(chunk)
      })
      
      res.on('end', () => {
        const xml = Buffer.concat(data).toString()
        resolve(xml)
      })
      
      res.on('error', err => {
        reject(err)
      })
    })
  })
}

async function parseRssFeed(xml: string): Promise<ChangelogEntry[]> {
  try {
    const parser = new Parser({
      explicitArray: false,
      trim: true
    })
    
    const result = await parser.parseStringPromise(xml)
    
    if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
      throw new Error('Invalid RSS feed structure')
    }
    
    const items = Array.isArray(result.rss.channel.item) 
      ? result.rss.channel.item 
      : [result.rss.channel.item]
    
    return items.map((item: any) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item['content:encoded'] || item.description || '',
      guid: item.guid && item.guid._ ? item.guid._ : item.guid
    }))
  } catch (error) {
    core.warning(`Error parsing RSS feed: ${error}`)
    throw new Error(`Failed to parse RSS feed: ${error}`)
  }
}
