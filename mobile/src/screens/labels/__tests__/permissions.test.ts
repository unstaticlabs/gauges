import { labelPermissions } from '../permissions';

describe('labelPermissions', () => {
  it('lets the only member delete, and not leave', () => {
    expect(labelPermissions({ members: ['a'], createdBy: 'a' }, 'a')).toEqual({
      shared: false,
      canLeave: false,
      canDelete: true,
    });
  });

  it('lets the creator of a shared label leave or delete', () => {
    expect(labelPermissions({ members: ['a', 'b'], createdBy: 'a' }, 'a')).toMatchObject({
      canLeave: true,
      canDelete: true,
    });
  });

  it('lets another member of a shared label leave only', () => {
    expect(labelPermissions({ members: ['a', 'b'], createdBy: 'a' }, 'b')).toMatchObject({
      canLeave: true,
      canDelete: false,
    });
  });

  it('lets the last member delete a label that another user created', () => {
    expect(labelPermissions({ members: ['b'], createdBy: 'a' }, 'b')).toMatchObject({ canDelete: true });
  });
});
