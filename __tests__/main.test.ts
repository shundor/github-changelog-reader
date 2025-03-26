/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/github.js'
import { wait } from '../__fixtures__/wait.js'
import * as fs from 'fs'
import * as path from 'path'

// Mock the modules
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('../src/wait.js', () => ({ wait }))
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}))
jest.unstable_mockModule('path', () => ({
  dirname: jest.fn().mockReturnValue('/mock-dir')
}))

// Mock the rss-feed module
jest.unstable_mockModule('../src/rss-feed.js', () => ({
  fetchChangelogFeed: jest.fn().mockResolvedValue([
    {
      title: 'Test Entry 1',
      link: 'https://example.com/1',
      pubDate: '2024-08-28',
      content: 'Test content 1',
      guid: 'entry-1'
    },
    {
      title: 'Test Entry 2',
      link: 'https://example.com/2',
      pubDate: '2024-08-27',
      content: 'Test content 2',
      guid: 'entry-2'
    }
  ])
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput()
    core.getInput.mockImplementation((name) => {
      switch (name) {
        case 'token':
          return 'mock-token'
        case 'label':
          return 'changelog'
        case 'store-location':
          return '.github/last-changelog-guid.txt'
        case 'issue-title-prefix':
          return 'GitHub Changelog: '
        case 'feed-url':
          return 'https://github.blog/changelog/feed/'
        default:
          return '500'
      }
    })

    // Mock the wait function so that it does not actually wait
    wait.mockImplementation(() => Promise.resolve('done!'))

    // Mock fs functions
    const fsMock = jest.mocked(fs)
    fsMock.existsSync.mockImplementation((path) => path === '.github/last-changelog-guid.txt')
    fsMock.readFileSync.mockImplementation(() => 'entry-2')

    // Mock github context
    github.context.repo = { owner: 'test-owner', repo: 'test-repo' }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Creates issues for new changelog entries', async () => {
    // Mock fs existsSync to return true for store location
    jest.mocked(fs.existsSync).mockReturnValue(true)

    await run()

    // Verify createIssue was called
    expect(github.octokit.rest.issues.create).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      title: 'GitHub Changelog: Test Entry 1',
      body: expect.stringContaining('Test content 1'),
      labels: ['changelog']
    })

    // Verify we updated the last processed ID
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.github/last-changelog-guid.txt',
      'entry-1'
    )

    // Verify outputs
    expect(core.setOutput).toHaveBeenCalledWith('issues-created', '1')
    expect(core.setOutput).toHaveBeenCalledWith('last-processed-guid', 'entry-1')
  })

  it('Creates issues for all entries when no previous entry exists', async () => {
    // Mock fs existsSync to return false for store location
    jest.mocked(fs.existsSync).mockReturnValue(false)

    await run()

    // Verify createIssue was called twice
    expect(github.octokit.rest.issues.create).toHaveBeenCalledTimes(2)

    // Verify we updated the last processed ID
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '.github/last-changelog-guid.txt',
      'entry-1'
    )

    // Verify outputs
    expect(core.setOutput).toHaveBeenCalledWith('issues-created', '2')
  })

  it('Handles errors gracefully', async () => {
    // Mock fetchChangelogFeed to throw an error
    jest.mocked(github.getOctokit).mockImplementation(() => {
      throw new Error('API Error')
    })

    await run()

    // Verify that the action was marked as failed
    expect(core.setFailed).toHaveBeenCalledWith('API Error')
  })
})
