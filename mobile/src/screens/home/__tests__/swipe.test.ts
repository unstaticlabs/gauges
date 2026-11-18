import {
  ACTION_BUTTON_WIDTH,
  ACTIONS_WIDTH,
  DONE_BUTTON_WIDTH,
  fullSwipeDistance,
  restingOffset,
  settleSwipe,
} from '../swipe';

const WIDTH = 400;

describe('fullSwipeDistance', () => {
  it('is half the row to the right, and past the two buttons to the left', () => {
    expect(fullSwipeDistance(WIDTH, 'right')).toBe(200);
    expect(fullSwipeDistance(WIDTH, 'left')).toBe(260);
    expect(fullSwipeDistance(600, 'left')).toBe(390);
    // On a narrow row, the full swipe stays 48 points past the two buttons.
    expect(fullSwipeDistance(300, 'left')).toBe(ACTIONS_WIDTH + 48);
  });

  it('stays past the buttons on a narrow row', () => {
    expect(fullSwipeDistance(200, 'right')).toBeGreaterThan(DONE_BUTTON_WIDTH);
    expect(fullSwipeDistance(200, 'left')).toBeGreaterThan(ACTIONS_WIDTH);
  });

  it('has room for the two buttons of the swipe to the left', () => {
    expect(ACTIONS_WIDTH).toBe(ACTION_BUTTON_WIDTH * 2);
  });
});

describe('settleSwipe', () => {
  it('closes a small move', () => {
    expect(settleSwipe(20, 0, WIDTH)).toBe('close');
    expect(settleSwipe(-40, 0, WIDTH)).toBe('close');
  });

  it('shows the Done button after a short swipe to the right', () => {
    expect(settleSwipe(80, 0, WIDTH)).toBe('showDone');
    expect(settleSwipe(150, 0, WIDTH)).toBe('showDone');
  });

  it('marks done after a full swipe to the right', () => {
    expect(settleSwipe(200, 0, WIDTH)).toBe('done');
    expect(settleSwipe(390, 0, WIDTH)).toBe('done');
  });

  it('shows the two buttons after a short swipe to the left', () => {
    expect(settleSwipe(-70, 0, WIDTH)).toBe('close');
    expect(settleSwipe(-90, 0, WIDTH)).toBe('showActions');
    expect(settleSwipe(-130, 0, WIDTH)).toBe('showActions');
    expect(settleSwipe(-250, 0, WIDTH)).toBe('showActions');
  });

  it('opens the gauge after a full swipe to the left', () => {
    expect(settleSwipe(-260, 0, WIDTH)).toBe('edit');
    expect(settleSwipe(-(ACTIONS_WIDTH + 48), 0, 300)).toBe('edit');
  });

  it('counts a fast flick as a longer swipe', () => {
    expect(settleSwipe(120, 1200, WIDTH)).toBe('done');
    expect(settleSwipe(-60, -1000, WIDTH)).toBe('showActions');
  });

  it('closes an open row when the flick goes back', () => {
    expect(settleSwipe(DONE_BUTTON_WIDTH, -1500, WIDTH)).toBe('close');
    expect(settleSwipe(DONE_BUTTON_WIDTH - 30, -800, WIDTH)).toBe('close');
    expect(settleSwipe(0, -2000, WIDTH)).toBe('showActions');
  });
});

describe('restingOffset', () => {
  it('keeps an open row at the width of its buttons', () => {
    expect(restingOffset('showDone')).toBe(DONE_BUTTON_WIDTH);
    expect(restingOffset('showActions')).toBe(-ACTIONS_WIDTH);
    expect(restingOffset('close')).toBe(0);
    expect(restingOffset('done')).toBe(0);
    expect(restingOffset('edit')).toBe(0);
  });
});
