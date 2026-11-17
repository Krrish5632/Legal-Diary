import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository, rescheduleInRepo } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import { createCase } from './actions';
import { setStatus, updateCaseDetails, addCaseNote } from './caseedit';

const NOW = '2026-03-01T10:00:00+05:30';

const makers: [string, () => Repository][] = [
  ['memory', () => new MemoryRepository()],
  ['indexeddb', () => new IndexedDbRepository('db' + Math.random(), new IDBFactory())],
];

async function mk(repo: Repository, num = '123') {
  return createCase(repo, {
    caseNumber: num, caseYear: '2025', caseType: 'Civil',
    court: { name: 'Court A', number: '', judgeName: '' },
    parties: { plaintiff: 'A Kumar', defendant: 'B Singh', oppositeCounsel: '' },
    legalSections: {}, priority: 'Normal', currentProceeding: 'Evidence', notes: '',
    hearingDate: '2026-03-10',
  }, NOW, 'tester');
}

const editInput = {
  caseNumber: '123/A', caseYear: '2025', caseType: 'Criminal' as const, currentProceeding: 'Bail',
  court: { name: 'Court A', number: '5', judgeName: '' },
  parties: { plaintiff: 'A Kumar', defendant: 'B Singh', oppositeCounsel: '' },
  legalSections: { policeStation: 'PS1' },
};

describe.each(makers)('caseedit on %s', (_name, make) => {
  it('toggles Urgent and back, with audit', async () => {
    const repo = make();
    const c = await mk(repo);
    expect((await setStatus(repo, c.id, 'Urgent', NOW, 'tester')).status).toBe('Urgent');
    expect((await setStatus(repo, c.id, 'Pending', NOW, 'tester')).status).toBe('Pending');
    expect((await repo.listAudit(c.id)).length).toBe(3);
    await expect(setStatus(repo, c.id, 'Pending', NOW, 'tester')).rejects.toThrow('already');
  });

  it('Disposed closes the scheduled hearing and keeps it as history', async () => {
    const repo = make();
    const c = await mk(repo);
    const d = await setStatus(repo, c.id, 'Disposed', NOW, 'tester', 'Withdrawn');
    expect(d.status).toBe('Disposed');
    expect(d.nextHearingDate).toBeNull();
    expect(d.lastHearingDate).toBe('2026-03-10');
    expect(d.totalHearings).toBe(1);
    const hs = await repo.getHearings(c.id);
    expect(hs).toHaveLength(1);
    expect(hs[0].state).toBe('completed');
    expect(hs[0].notes).toContain('Withdrawn');
    const saved = await repo.getCase(c.id);
    expect(saved?.status).toBe('Disposed');
  });

  it('a reopened case can be given a new date', async () => {
    const repo = make();
    const c = await mk(repo);
    await setStatus(repo, c.id, 'Disposed', NOW, 'tester');
    await setStatus(repo, c.id, 'Pending', NOW, 'tester');
    const r = await rescheduleInRepo(repo, c.id, '2026-04-01', {}, NOW, 'tester');
    expect(r.nextHearingDate).toBe('2026-04-01');
    expect(await repo.getHearings(c.id)).toHaveLength(2);
  });

  it('edits details, keeps dates, refuses empty change and duplicates', async () => {
    const repo = make();
    const c = await mk(repo);
    const e = await updateCaseDetails(repo, c.id, editInput, NOW, 'tester');
    expect(e.caseNumber).toBe('123/A');
    expect(e.caseType).toBe('Criminal');
    expect(e.court.number).toBe('5');
    expect(e.legalSections.policeStation).toBe('PS1');
    expect(e.entryDate).toBe(c.entryDate);
    expect(e.nextHearingDate).toBe(c.nextHearingDate);
    await expect(updateCaseDetails(repo, c.id, editInput, NOW, 'tester')).rejects.toThrow('Nothing');
    await expect(updateCaseDetails(repo, c.id, { ...editInput, caseNumber: '  ' }, NOW, 'tester')).rejects.toThrow('required');
    const other = await mk(repo, '999');
    await expect(updateCaseDetails(repo, other.id, { ...editInput, caseNumber: '123/A', caseType: 'Civil' }, NOW, 'tester'))
      .rejects.toThrow('already');
  });

  it('notes are only added, never replaced', async () => {
    const repo = make();
    const c = await mk(repo);
    await addCaseNote(repo, c.id, 'first', NOW, 'tester');
    const n = await addCaseNote(repo, c.id, 'second', NOW, 'tester');
    expect(n.notes).toBe('[2026-03-01] first\n\n[2026-03-01] second');
    await expect(addCaseNote(repo, c.id, '   ', NOW, 'tester')).rejects.toThrow('write');
  });
});
// end of caseedit.test.ts
