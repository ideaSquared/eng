// Kept in step with shipper's PRODUCTS and agent-idea's projects.
export const SHIP_PRODUCTS = ['ads', 'agent-idea', 'creatrgrid', 'gaminginit', 'gaminginit-bot', 'ideasquared-bot'];
export const IDEA_PROJECTS = ['ads', 'creatrgrid', 'gaminginit', 'gaminginit-bot', 'ideasquared-bot', 'pairflix'];
const run = (command, args) => ({ kind: 'run', command, args });
const pick = (title, names, next) => ({
    title,
    items: names.map((name) => ({ label: name, next: next(name) })),
});
// A redeploy ships the same commit again even when it is already live (ship deploy --redeploy).
const environments = (verb) => (product) => {
    const extra = verb === 'Redeploy' ? ['--redeploy'] : [];
    return {
        title: `${verb} ${product} to`,
        items: [
            { label: 'staging', next: run('ship', ['deploy', product, 'staging', ...extra]) },
            { label: 'production', hint: 'asks you to type the product name', next: run('ship', ['deploy', product, 'production', ...extra]) },
        ],
    };
};
export const HOME = {
    title: 'What do you want to do?',
    items: [
        { label: 'Status', hint: 'what is live in every product', next: run('ship', ['status']) },
        { label: 'Deploy', hint: 'ship a product to staging or production', next: pick('Deploy which product?', SHIP_PRODUCTS, environments('Deploy')) },
        {
            label: 'Redeploy',
            hint: 'deploy again, even if that commit is already live',
            next: pick('Redeploy which product?', SHIP_PRODUCTS, environments('Redeploy')),
        },
        { label: 'Logs', hint: 'sanitised logs from the last hour', next: pick('Logs for', IDEA_PROJECTS, (p) => run('idea', ['logs', p])) },
        {
            label: 'Failed runs',
            hint: 'GitHub Actions failures, with their logs',
            next: pick('Failed runs for', IDEA_PROJECTS, (p) => run('idea', ['runs', p, '--failed'])),
        },
        { label: 'Doctor', hint: 'check what is missing or out of date', next: run('eng', ['doctor']) },
        { label: 'Update', hint: 'update the CLIs and pull every clean repo', next: run('eng', ['update']) },
        { label: 'Setup', hint: 'sign in, install and clone everything', next: run('eng', ['setup']) },
        { label: 'Terminal theme', hint: 'install the ideaSquared skin and prompt', next: run('eng', ['theme']) },
        { label: 'Quit', next: { kind: 'quit' } },
    ],
};
export const isMenu = (next) => 'items' in next;
