import { gaugeAvatarOrder, labelAvatarOrder, orderMembersByRecentExecution } from '../avatars';
import { makeGauge } from '../__testSupport__/makeGauge';

describe('orderMembersByRecentExecution', () => {
  it('puts the most recent first, each member one time, and the rest last in their order', () => {
    const members = ['ana', 'ben', 'cleo', 'dan', 'eva'];
    const executions = [
      { at: 100, by: 'cleo' },
      { at: 300, by: 'ben' },
      { at: 200, by: 'cleo' },
      { at: 50, by: 'ben' },
      { at: 999, by: 'stranger' },
    ];
    expect(orderMembersByRecentExecution(members, executions)).toEqual([
      'ben',
      'cleo',
      'ana',
      'dan',
      'eva',
    ]);
  });

  it('removes duplicate members', () => {
    expect(orderMembersByRecentExecution(['a', 'b', 'a'], [])).toEqual(['a', 'b']);
  });
});

describe('gaugeAvatarOrder', () => {
  it('uses the executions of the gauge', () => {
    const gauge = makeGauge({
      members: ['u1', 'u2', 'u3'],
      executions: [
        { at: 10, by: 'u3' },
        { at: 20, by: 'u2' },
      ],
    });
    expect(gaugeAvatarOrder(gauge)).toEqual(['u2', 'u3', 'u1']);
  });
});

describe('labelAvatarOrder', () => {
  it('uses the executions of each gauge of the label and ignores other gauges', () => {
    const label = { id: 'home', members: ['u1', 'u2', 'u3'] };
    const gauges = [
      makeGauge({ id: 'g1', labelIds: ['home'], executions: [{ at: 10, by: 'u1' }] }),
      makeGauge({ id: 'g2', labelIds: ['home', 'x'], executions: [{ at: 30, by: 'u3' }] }),
      makeGauge({ id: 'g3', labelIds: ['x'], executions: [{ at: 99, by: 'u2' }] }),
    ];
    expect(labelAvatarOrder(label, gauges)).toEqual(['u3', 'u1', 'u2']);
  });
});
