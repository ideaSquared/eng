import { describe, expect, it } from 'vitest';
import { homeMenu, IDEA_PROJECTS, searchIndex, searchMenu, SHIP_PRODUCTS } from '../src/menu.ts';

const index = searchIndex(homeMenu('staging'));
const labels = (text: string) => searchMenu(index, text).map((e) => e.label);

describe('the menu search index', () => {
  it('lists every leaf action by its path, in menu order', () => {
    expect(index[0]).toEqual({ label: 'Status', action: { kind: 'run', command: 'ship', args: ['status'] } });
    expect(index.map((e) => e.label)).toEqual(
      expect.arrayContaining(['Deploy › ads', 'Redeploy › creatrgrid', 'Logs › creatrgrid', 'Failed runs › pairflix', 'Ops › creatrgrid', 'Doctor', 'Quit']),
    );
    expect(index.find((e) => e.label === 'Logs › ads')?.action).toEqual({ kind: 'run', command: 'idea', args: ['logs', 'ads', '--env', 'staging'] });
    expect(index.some((e) => e.label === 'Deploy')).toBe(false);
  });

  it('matches when every word is in the label, in any case', () => {
    expect(labels('DEPLOY ads')).toEqual(['Deploy › ads', 'Redeploy › ads']);
    expect(labels('logs creatr')).toEqual(['Logs › creatrgrid']);
    expect(labels('doctor')).toEqual(['Doctor']);
    expect(labels('deploy zzz')).toEqual([]);
  });

  it('matches everything for empty text and keeps menu order', () => {
    expect(labels('  ')).toEqual(index.map((e) => e.label));
    expect(labels('ads').indexOf('Deploy › ads')).toBeLessThan(labels('ads').indexOf('Redeploy › ads'));
  });
});

describe('the product lists', () => {
  it('deploys the products shipper knows, and no retired ones', () => {
    expect(SHIP_PRODUCTS).toEqual(['ads', 'agent-idea', 'creatrgrid', 'ideasquared-bot', 'ideasquared-website', 'pairflix']);
  });

  it('reads logs and runs only for the projects agent-idea serves', () => {
    expect(IDEA_PROJECTS).toEqual(['ads', 'creatrgrid', 'ideasquared-bot', 'pairflix']);
  });
});
