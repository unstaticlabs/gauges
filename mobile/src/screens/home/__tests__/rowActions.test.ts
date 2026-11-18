import { rowMenuActions, swipeLeftActions, swipeRightAction } from '../rowActions';

describe('swipeRightAction', () => {
  it('marks an active gauge done, and resumes a paused gauge', () => {
    expect(swipeRightAction(false)).toBe('done');
    expect(swipeRightAction(true)).toBe('resume');
  });
});

describe('swipeLeftActions', () => {
  it('shows Delete, Pause, and Edit on an active row', () => {
    expect(swipeLeftActions(false)).toEqual(['delete', 'pause', 'edit']);
  });

  it('shows Delete, Archive, and Edit on a paused row', () => {
    expect(swipeLeftActions(true)).toEqual(['delete', 'archive', 'edit']);
  });
});

describe('rowMenuActions', () => {
  it('gives an active row "Pause" and no "Archive"', () => {
    const actions = rowMenuActions(false);
    expect(actions).toEqual(['done', 'pause', 'edit', 'delete']);
    expect(actions).not.toContain('archive');
    expect(actions).not.toContain('resume');
  });

  it('gives a paused row "Resume" and "Archive", and no "Pause" or "Done"', () => {
    const actions = rowMenuActions(true);
    expect(actions).toEqual(['resume', 'edit', 'archive', 'delete']);
    expect(actions).not.toContain('pause');
    expect(actions).not.toContain('done');
  });

  it('has each action of the swipe in the menu, with no duplicate', () => {
    for (const paused of [false, true]) {
      const menu = rowMenuActions(paused);
      expect(new Set(menu).size).toBe(menu.length);
      for (const action of [swipeRightAction(paused), ...swipeLeftActions(paused)]) {
        expect(menu).toContain(action);
      }
    }
  });
});
