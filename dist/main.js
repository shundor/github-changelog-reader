import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { fetchChangelogFeed } from './rss-feed.js';
export async function run() {
    try {
        // Get inputs
        const token = core.getInput('token');
        const label = core.getInput('label');
        const storeLocation = core.getInput('store-location');
        const issueTitlePrefix = core.getInput('issue-title-prefix');
        const feedUrl = core.getInput('feed-url');
        const autoLabel = core.getInput('auto-label') === 'true';
        const octokit = github.getOctokit(token);
        const context = github.context;
        // Ensure directory exists for the store location
        const storeDir = path.dirname(storeLocation);
        if (!fs.existsSync(storeDir)) {
            fs.mkdirSync(storeDir, { recursive: true });
        }
        // Get the last processed entry ID
        let lastProcessedGuid = null;
        try {
            if (fs.existsSync(storeLocation)) {
                lastProcessedGuid = fs.readFileSync(storeLocation, 'utf8').trim();
                core.info(`Last processed changelog entry: ${lastProcessedGuid}`);
            }
            else {
                core.info('No previously processed entries found');
            }
        }
        catch (error) {
            core.warning(`Error reading last processed entry: ${error}`);
        }
        // Fetch the RSS feed
        const entries = await fetchChangelogFeed(feedUrl);
        core.info(`Found ${entries.length} entries in the feed`);
        // Filter for new entries
        let newEntries = entries;
        if (lastProcessedGuid) {
            const lastProcessedIndex = entries.findIndex((entry) => entry.guid === lastProcessedGuid);
            if (lastProcessedIndex !== -1) {
                newEntries = entries.slice(0, lastProcessedIndex);
            }
        }
        core.info(`Found ${newEntries.length} new entries to process`);
        // Create issues for new entries
        let issuesCreated = 0;
        for (const entry of newEntries) {
            await createIssueFromEntry(octokit, context.repo, entry, label, issueTitlePrefix, autoLabel);
            issuesCreated++;
            core.info(`Created issue for entry: ${entry.title}`);
        }
        // Store the ID of the latest entry
        if (entries.length > 0) {
            const latestGuid = entries[0].guid;
            fs.writeFileSync(storeLocation, latestGuid);
            core.info(`Updated last processed entry to: ${latestGuid}`);
            core.setOutput('last-processed-guid', latestGuid);
        }
        // Set outputs
        core.setOutput('issues-created', issuesCreated.toString());
        core.info(`Created ${issuesCreated} new issues`);
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed(`Unknown error: ${error}`);
        }
    }
}
async function createIssueFromEntry(octokit, repo, entry, label, titlePrefix, autoLabel) {
    const title = `${titlePrefix}${entry.title}`;
    const body = `
# ${entry.title}

${entry.content}

---

🔗 [View original changelog entry](${entry.link})
📅 Published: ${entry.pubDate}
  `.trim();
    const labels = [];
    // Add the base label if provided
    if (label) {
        labels.push(label);
    }
    // Add category-based labels if auto-label is enabled
    if (autoLabel) {
        if (entry.changelogType) {
            labels.push(entry.changelogType);
        }
        if (entry.changelogLabel) {
            labels.push(entry.changelogLabel);
        }
    }
    // Ensure all labels exist in the repository
    if (labels.length > 0) {
        await ensureLabelsExist(octokit, repo, labels);
    }
    await octokit.rest.issues.create({
        ...repo,
        title,
        body,
        labels
    });
}
async function ensureLabelsExist(octokit, repo, labels) {
    for (const labelName of labels) {
        try {
            // Try to get the label
            await octokit.rest.issues.getLabel({
                ...repo,
                name: labelName
            });
            core.info(`Label '${labelName}' already exists`);
        }
        catch (error) {
            // If label doesn't exist, create it
            if (error &&
                typeof error === 'object' &&
                'status' in error &&
                error.status === 404) {
                try {
                    await octokit.rest.issues.createLabel({
                        ...repo,
                        name: labelName,
                        color: getDefaultLabelColor(labelName),
                        description: 'Auto-created label'
                    });
                    core.info(`Created label '${labelName}'`);
                }
                catch (createError) {
                    core.warning(`Failed to create label '${labelName}': ${createError}`);
                }
            }
            else {
                core.warning(`Error checking label '${labelName}': ${error}`);
            }
        }
    }
}
function getDefaultLabelColor(labelName) {
    // Generate a consistent color based on the label name
    // Use a simple hash function to convert label name to a color
    let hash = 0;
    for (let i = 0; i < labelName.length; i++) {
        hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Convert hash to a 6-digit hex color
    // Ensure we get exactly 6 hex digits by padding to at least 6 chars and taking only the last 6
    const color = (Math.abs(hash) % 0xffffff).toString(16).padStart(6, '0');
    return color;
}
