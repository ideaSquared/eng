// The repos a developer works in, and how each one should be brought up to date.
export const ORG = 'ideaSquared';
export const REPOS = [
    'adopt-dont-shop',
    'agent-idea',
    'creatrgrid',
    'eng',
    'gaminginit',
    'gaminginit-bot',
    'ideasquared-bot',
    'pairflix',
    'shipper',
];
// Global CLIs, installed and updated from their repos' default branches.
export const GLOBAL_PACKAGES = [
    `github:${ORG}/eng`,
    `github:${ORG}/shipper`,
    `github:${ORG}/agent-idea`,
];
// Only a clean checkout of the default branch is pulled, so update never touches work in progress.
export const planRepo = (state) => {
    if (!state.cloned)
        return { name: state.name, action: 'clone' };
    if (state.dirty)
        return { name: state.name, action: 'skip', reason: 'has uncommitted changes' };
    if (!state.branch || state.branch !== state.defaultBranch) {
        return {
            name: state.name,
            action: 'skip',
            reason: `on ${state.branch ?? 'a detached HEAD'}, not ${state.defaultBranch ?? 'the default branch'}`,
        };
    }
    return { name: state.name, action: 'pull' };
};
