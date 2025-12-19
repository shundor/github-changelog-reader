jest.mock('../src/rss-feed.js', () => ({
  fetchChangelogFeed: jest.fn()
}))

const mockCreateIssue = jest.fn()
const mockGetLabel = jest.fn()
const mockCreateLabel = jest.fn()
jest.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: {
      issues: {
        create: mockCreateIssue,
        getLabel: mockGetLabel,
        createLabel: mockCreateLabel
      }
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
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}))

const mockSetOutput = jest.fn()
const mockGetInput = jest.fn()
const mockSetFailed = jest.fn()
const mockInfo = jest.fn()
const mockWarning = jest.fn()
jest.mock('@actions/core', () => ({
  getInput: mockGetInput,
  setOutput: mockSetOutput,
  info: mockInfo,
  warning: mockWarning,
  setFailed: mockSetFailed
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
        case 'auto-label':
          return 'true'
        default:
          return ''
      }
    })

    // Mock createIssue to return successful response
    mockCreateIssue.mockResolvedValue({ data: { number: 1 } })

    // Mock getLabel to return successful response (label exists) by default
    mockGetLabel.mockResolvedValue({ data: { name: 'changelog' } })

    // Mock createLabel to return successful response
    mockCreateLabel.mockResolvedValue({ data: { name: 'test-label' } })

    // Reset fs mocks to default state
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    ;(fs.readFileSync as jest.Mock).mockReturnValue('')
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

  test('creates issues with category labels when auto-label is enabled', async () => {
    const mockEntries = [
      {
        guid: '123',
        title: 'New Feature',
        content: 'Added something cool',
        link: 'https://example.com/123',
        pubDate: '2024-01-01',
        changelogType: 'Improvement',
        changelogLabel: 'Copilot'
      }
    ]

    rssModule.fetchChangelogFeed.mockResolvedValueOnce(mockEntries)

    // Mock label checks - changelog exists, but category labels don't
    mockGetLabel.mockImplementation((params: { name: string }) => {
      if (params.name === 'changelog') {
        return Promise.resolve({ data: { name: 'changelog' } })
      }
      // Category labels don't exist yet - return 404
      return Promise.reject({ status: 404 })
    })

    await main.run()

    // Check that labels were created
    expect(mockCreateLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Improvement'
      })
    )
    expect(mockCreateLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Copilot'
      })
    )

    // Check that issue was created with all labels
    expect(mockCreateIssue).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      title: '[Changelog] New Feature',
      body: expect.stringContaining('Added something cool'),
      labels: ['changelog', 'Improvement', 'Copilot']
    })

    expect(mockSetOutput).toHaveBeenCalledWith('issues-created', '1')
  })

  test('does not add category labels when auto-label is disabled', async () => {
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
        case 'auto-label':
          return 'false'
        default:
          return ''
      }
    })

    const mockEntries = [
      {
        guid: '123',
        title: 'New Feature',
        content: 'Added something cool',
        link: 'https://example.com/123',
        pubDate: '2024-01-01',
        changelogType: 'Improvement',
        changelogLabel: 'Copilot'
      }
    ]

    rssModule.fetchChangelogFeed.mockResolvedValueOnce(mockEntries)

    await main.run()

    // Check that issue was created with only the base label
    expect(mockCreateIssue).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      title: '[Changelog] New Feature',
      body: expect.stringContaining('Added something cool'),
      labels: ['changelog']
    })

    // Category labels should not have been created
    expect(mockCreateLabel).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Improvement'
      })
    )

    expect(mockSetOutput).toHaveBeenCalledWith('issues-created', '1')
  })

  test('handles entries without categories', async () => {
    const mockEntries = [
      {
        guid: '123',
        title: 'New Feature',
        content: 'Added something cool',
        link: 'https://example.com/123',
        pubDate: '2024-01-01'
      }
    ]

    rssModule.fetchChangelogFeed.mockResolvedValueOnce(mockEntries)

    await main.run()

    // Check that issue was created with only the base label
    expect(mockCreateIssue).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      title: '[Changelog] New Feature',
      body: expect.stringContaining('Added something cool'),
      labels: ['changelog']
    })

    expect(mockSetOutput).toHaveBeenCalledWith('issues-created', '1')
  })
})
