jest.mock('../src/rss-feed.js', () => ({
  fetchChangelogFeed: jest.fn()
}))

const mockCreateIssue = jest.fn()
jest.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      issues: { create: mockCreateIssue }
    }
  }),
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  }
}))

// Add mock for fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue(''),
  writeFileSync: jest.fn()
}))

const mockSetOutput = jest.fn()
const mockGetInput = jest.fn()
jest.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn()
}))

describe('GitHub Changelog Reader', () => {
  let main: any
  let rssModule: any
  let fs: typeof import('fs')

  beforeEach(async () => {
    jest.clearAllMocks()

    // Import modules in beforeEach to ensure clean state
    jest.resetModules()
    main = await import('../src/main')
    rssModule = await import('../src/rss-feed.js')
    fs = await import('fs')

    // Reset the mock to return an empty array by default
    rssModule.fetchChangelogFeed.mockResolvedValue([])

    mockGetInput.mockImplementation((name: string) => {
      switch (name) {
        case 'token':
          return 'fake-token'
        case 'label':
          return 'changelog'
        case 'store-location':
          return '../github/last-changelog-guid-test.txt'
        case 'issue-title-prefix':
          return '[Changelog] '
        case 'feed-url':
          return 'https://example.com/feed'
        default:
          return ''
      }
    })

    // Mock createIssue to return successful response
    mockCreateIssue.mockResolvedValue({ data: { number: 1 } })
  })

  // test('creates issues for new changelog entries', async () => {
  //   const mockEntries = [
  //     {
  //       guid: '123',
  //       title: 'New Feature',
  //       content: 'Added something cool',
  //       link: 'https://example.com/123',
  //       pubDate: '2024-01-01'
  //     }
  //   ]

  //   // Set up the mock for fetchChangelogFeed
  //   rssModule.fetchChangelogFeed.mockResolvedValueOnce(mockEntries)

  //   await main.run()

  //   // Test that the issue was created with the right parameters
  //   expect(mockCreateIssue).toHaveBeenCalledWith({
  //     owner: 'test-owner',
  //     repo: 'test-repo',
  //     title: '[Changelog] New Feature',
  //     body: expect.stringContaining('Added something cool'),
  //     labels: ['changelog']
  //   })

  //   expect(mockSetOutput).toHaveBeenCalledWith('issues-created', '1')
  // })

  test('skips already processed entries', async () => {
    // Configure fs mocks to indicate entry was already processed
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockReturnValue('123')

    const mockEntries = [
      {
        guid: '123',
        title: 'Old Feature',
        content: 'Already processed',
        link: 'https://example.com/123',
        pubDate: '2024-01-01'
      }
    ]

    rssModule.fetchChangelogFeed.mockResolvedValueOnce(mockEntries)

    await main.run()

    expect(mockCreateIssue).not.toHaveBeenCalled()
    expect(mockSetOutput).toHaveBeenCalledWith('issues-created', '0')
  })
})
