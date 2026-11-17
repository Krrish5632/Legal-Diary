import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository, rescheduleInRepo } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import { addPastHearing, addToCurrentHearing, createCase, setPriority } from './actions';
import type { NewCaseInput } from './actions';

const NOW = '2026-01-01T10:00:00+05:30';

let n = 0;
const makers: [string, () => Repository][] = [
  ['Memory', () => new MemoryRepository()],
  ['IndexedDB', () => new IndexedDbRepository('act_' + (n++), new IDBFactory() as unknown as IDBFactory)],
];

const base: NewCaseInput = {
  caseNumber: 'CS 12/2025', caseYear: '2025', caseType: 'Civil',
  court: { name: 'District Court' }, parties: { plaintiff: 'A Kumar', defendant: 'B Singh' },
  legalSections: {}, priority: 'Normal', currentProceeding: 'Evidence', notes: '',
  hearingDate: '2026-03-10',
};

describe.each(makers)('actions: %s', (_name, make) => {
  it('creates a case with its first scheduled hearing and an audit entry', async () => {
    const r = make();
    const c = await createCase(r, base, NOW, 'test');
    expect(c.entryDate).toBe('2026-01-01');
    expect(c.entryDateSource).toBe('app');
    expect(c.initialHearingDate).toBe('2026-03-10');
    expect(c.nextHearingDate).toBe('2026-03-10');
    expect(c.totalHearings).toBe(0);
    const hs = await r.getHearings(c.id);
    expect(hs.length).toBe(1);
    expect(hs[0].state).toBe('scheduled');
    expect(hs[0].source).toBe('app');
    expect((await r.listAudit(c.id)).map(a => a.action)).toEqual(['created']);
  });

  it('rejects bad input and a duplicate, and saves nothing for them', async () => {
    const r = make();
    await expect(createCase(r, { ...base, caseNumber: '   ' }, NOW, 'test')).rejects.toThrow();
    await expect(createCase(r, { ...base, hearingDate: 'abc' }, NOW, 'test')).rejects.toThrow();
    await expect(createCase(r, { ...base, parties: {} }, NOW, 'test')).rejects.toThrow();
    expect((await r.counts()).cases).toBe(0);
    await createCase(r, base, NOW, 'test');
    await expect(createCase(r, base, NOW, 'test')).rejects.toThrow();
    expect(await r.counts()).toEqual({ cases: 1, hearings: 1, audit: 1 });
  });

  it('adds a past hearing without touching the next date', async () => {
    const r = make();
    const c = await createCase(r, base, NOW, 'test');
    const u = await addPastHearing(r, c.id, '2025-12-01', { notes: 'Arguments heard' }, NOW, 'test');
    expect(u.lastHearingDate).toBe('2025-12-01');
    expect(u.totalHearings).toBe(1);
    expect(u.nextHearingDate).toBe('2026-03-10');
    const hs = await r.getHearings(c.id);
    expect(hs.map(h => h.hearingDate)).toEqual(['2025-12-01', '2026-03-10']);
    expect(hs[0].state).toBe('completed');
    expect(hs[0].notes).toBe('Arguments heard');
  });

  it('refuses a past hearing that is in the future, duplicate, or the next date', async () => {
    const r = make();
    const c = await createCase(r, base, NOW, 'test');
    await addPastHearing(r, c.id, '2025-12-01', {}, NOW, 'test');
    await expect(addPastHearing(r, c.id, '2026-02-01', {}, NOW, 'test')).rejects.toThrow();
    await expect(addPastHearing(r, c.id, '2025-12-01', {}, NOW, 'test')).rejects.toThrow();
    await expect(addPastHearing(r, c.id, '2026-03-10', {}, NOW, 'test')).rejects.toThrow();
    await expect(addPastHearing(r, c.id, 'nope', {}, NOW, 'test')).rejects.toThrow();
    expect((await r.getHearings(c.id)).length).toBe(2);
  });

  it('adds text to the current hearing and keeps the old text', async () => {
    const r = make();
    const c = await createCase(r, base, NOW, 'test');
    await addToCurrentHearing(r, c.id, { proceedings: 'Evidence' }, NOW, 'test');
    await addToCurrentHearing(r, c.id, { proceedings: 'Cross exam', courtOrder: 'Stay' }, NOW, 'test');
    const h = (await r.getHearings(c.id))[0];
    expect(h.proceedings).toBe('Evidence | Cross exam');
    expect(h.courtOrder).toBe('Stay');
    await expect(addToCurrentHearing(r, c.id, { notes: '  ' }, NOW, 'test')).rejects.toThrow();
    expect((await r.listAudit(c.id)).filter(a => a.action === 'edited').length).toBe(2);
  });

  it('changes priority and records it; same priority is refused', async () => {
    const r = make();
    const c = await createCase(r, base, NOW, 'test');
    const u = await setPriority(r, c.id, 'High', NOW, 'test');
    expect(u.priority).toBe('High');
    expect((await r.getCase(c.id))?.priority).toBe('High');
    await expect(setPriority(r, c.id, 'High', NOW, 'test')).rejects.toThrow();
    expect((await r.listAudit(c.id)).some(a => a.action === 'priority-changed')).toBe(true);
  });

  it('refuses to move a case back to a date that is already a completed hearing', async () => {
    const r = make();
    const c = await createCase(r, base, NOW, 'test');
    await rescheduleInRepo(r, c.id, '2026-04-20', {}, NOW, 'test');
    await expect(rescheduleInRepo(r, c.id, '2026-03-10', {}, '2026-01-02T10:00:00+05:30', 'test')).rejects.toThrow();
    expect((await r.getCase(c.id))?.nextHearingDate).toBe('2026-04-20');
  });
});
// end of actions.test.ts
