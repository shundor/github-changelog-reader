import { jest } from '@jest/globals'

export const context = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  }
}

export const octokit = {
  rest: {
    issues: {
      create: jest.fn().mockResolvedValue({ data: { number: 1 } })
    }
  }
}

export const getOctokit = jest.fn().mockReturnValue(octokit)
