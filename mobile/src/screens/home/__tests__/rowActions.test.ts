import { rowMenuActions, swipeLeftActions, swipeRightAction } from '../rowActions';

describe('swipeRightAction', () => {
  it('marks an active gauge done, and resumes a paused gauge', () => {
    expect(swipeRightAction(false)).toBe('done');
    expect(swipeRightAction(true)).toBe('resume');
  });
});

describe('swipeLeftActions', () => {
  it('shows Pause and Edit on an active row', () => {
    expect(swipeLeftActions(false)).toEqual(['pause', 'edit']);
  });

  it('shows Archive and Edit on a paused row', () => {
    expect(swipeLeftActions(true)).toEqual(['archive', 'edit']);
  });
});

describe('rowMenuActions', () => {
  it('gives an active row "Pause" and no "Archive"', () => {
    const actions = rowMenuActions(false);
    expect(actions).toEqual(['done', 'pause', 'edit']);
    expect(actions).not.toContain('archive');
    expect(actions).not.toContain('resume');
  });

  it('gives a paused row "Resume" and "Archive", and no "Pause" or "Done"', () => {
    const actions = rowMenuActions(true);
    expect(actions).toEqual(['resume', 'edit', 'archive']);
    expect(actions).not.toContain('pause');
    expect(actions).not.toContain('done');
  });

  it('never offers "Delete" on a row', () => {
    for (const paused of [false, true]) {
      expect(rowMenuActions(paused)).not.toContain('delete');
      expect(swipeLeftActions(paused)).not.toContain('delete');
    }
  });

  it('has the same actions in the menu as in the swipes, with no duplicate', () => {
    for (const paused of [false, true]) {
      const menu = rowMenuActions(paused);
      expect(new Set(menu).size).toBe(menu.length);
      const swipes = [swipeRightAction(paused), ...swipeLeftActions(paused)];
      expect([...menu].sort()).toEqual([...swipes].sort());
    }
  });
});
