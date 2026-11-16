import {
  membersToRemove,
  planAddLabel,
  planLeaveLabel,
  planMarkDone,
  planRemoveLabel,
} from '../plans';
import { fakeSentinels as s, gauge, label } from '../testing/fakes';

describe('plans', () => {
  it('marks done with arrayUnion, so no copy of the list goes to the server', () => {
    expect(planMarkDone('g1', { at: 5, by: 'bob' }, s)).toEqual([
      { type: 'update', path: 'gauges/g1', data: { executions: { union: [{ at: { ts: 5 }, by: 'bob' }] } } },
    ]);
  });

  it('adds a label: label ID, gauge ID, members, and joinVia in one batch', () => {
    const ops = planAddLabel(gauge(), label({ id: 'L2', members: ['alice', 'dave'] }), 'alice', s);
    expect(ops).toEqual([
      {
        type: 'update',
        path: 'gauges/g1',
        data: { labelIds: { union: ['L2'] }, members: { union: ['alice', 'dave'] }, joinVia: 'L2' },
      },
      { type: 'update', path: 'labels/L2', data: { gaugeIds: { union: ['g1'] } } },
    ]);
  });

  it('refuses to add a label of which the caller is not a member', () => {
    expect(() => planAddLabel(gauge(), label({ members: ['erin'] }), 'alice', s)).toThrow();
  });

  it('keeps the creator and the members of other known labels on removal', () => {
    const g = gauge({ labelIds: ['L1', 'L2'], members: ['alice', 'bob', 'carol', 'dave'] });
    const removed = label({ id: 'L1', members: ['alice', 'bob', 'carol'] });
    const other = label({ id: 'L2', members: ['alice', 'carol', 'dave'] });
    expect(membersToRemove(g, removed, [other])).toEqual(['bob']);
    const ops = planRemoveLabel(g, removed, [other], 'alice', s);
    expect(ops[0].type === 'update' && ops[0].data).toEqual({
      labelIds: { remove: ['L1'] },
      members: { remove: ['bob'] },
      mutedBy: { remove: ['bob'] },
    });
  });

  it('leaves only the gauges that the user has through no other label', () => {
    const l1 = label({ id: 'L1', members: ['alice', 'bob'], gaugeIds: ['g1', 'g2', 'g3'] });
    const l2 = label({ id: 'L2', members: ['bob'] });
    const gauges = [
      gauge({ id: 'g1', labelIds: ['L1'], members: ['alice', 'bob'] }),
      gauge({ id: 'g2', labelIds: ['L1', 'L2'], members: ['alice', 'bob'] }),
      gauge({ id: 'g3', labelIds: ['L1'], members: ['bob', 'alice'], createdBy: 'bob' }),
    ];
    const paths = planLeaveLabel(l1, gauges, [l1, l2], 'bob', s).map((o) => o.path);
    expect(paths).toEqual(['labels/L1', 'gauges/g1']);
  });

  it('refuses a leave by the last member', () => {
    expect(() => planLeaveLabel(label(), [], [], 'alice', s)).toThrow();
  });
});
