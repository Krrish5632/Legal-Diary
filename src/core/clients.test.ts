import { describe, it, expect } from 'vitest';
import { MemoryRepository } from './repository';
import { createCase } from './actions';
import {
  addClientsFromNames, casesForClient, loadClients, saveClient, setArchived, suggestedNames,
} from './clients';

const NOW = '2026-03-01T10:00:00+05:30';
const blank = { phone: '', email: '', address: '', notes: '' };

describe('clients', () => {
  it('adds, edits, archives and refuses duplicates', async () => {
    const repo = new MemoryRepository();
    expect(await loadClients(repo)).toEqual([]);
    const a = await saveClient(repo, { name: '  A Kumar ', ...blank }, NOW);
    expect(a.name).toBe('A Kumar');
    await expect(saveClient(repo, { name: 'a  kumar', ...blank }, NOW)).rejects.toThrow('already');
    await expect(saveClient(repo, { name: '  ', ...blank }, NOW)).rejects.toThrow('required');
    const e = await saveClient(repo, { name: 'A Kumar', ...blank, phone: '123' }, NOW, a.id);
    expect(e.phone).toBe('123');
    expect(e.createdAt).toBe(a.createdAt);
    await setArchived(repo, a.id, true, NOW);
    const list = await loadClients(repo);
    expect(list).toHaveLength(1);
    expect(list[0].archived).toBe(true);
  });

  it('does not overwrite a damaged list', async () => {
    const repo = new MemoryRepository();
    await repo.commit({ setMeta: { clients_v1: '{bad' } });
    await expect(loadClients(repo)).rejects.toThrow('damaged');
    await expect(saveClient(repo, { name: 'X', ...blank }, NOW)).rejects.toThrow('damaged');
    expect(await repo.getMeta('clients_v1')).toBe('{bad');
  });

  it('suggests names from cases only when asked, and links cases', async () => {
    const repo = new MemoryRepository();
    const mk = (num: string, p: string, d: string) => createCase(repo, {
      caseNumber: num, caseYear: '2025', caseType: 'Civil',
      court: { name: 'C', number: '', judgeName: '' },
      parties: { plaintiff: p, defendant: d, oppositeCounsel: '' },
      legalSections: {}, priority: 'Normal', currentProceeding: '', notes: '', hearingDate: '2026-03-10',
    }, NOW, 'tester');
    await mk('1', 'A Kumar', 'B Singh');
    await mk('2', 'a kumar', 'C Devi');
    expect(await loadClients(repo)).toEqual([]);
    const cases = await repo.listCases();
    const s = suggestedNames(cases, []);
    expect(s[0].name).toBe('A Kumar');
    expect(s[0].count).toBe(2);
    expect(s).toHaveLength(3);
    expect(await addClientsFromNames(repo, ['A Kumar', 'a kumar', ''], NOW)).toBe(1);
    const clients = await loadClients(repo);
    expect(suggestedNames(cases, clients)).toHaveLength(2);
    expect(casesForClient(clients[0], cases)).toHaveLength(2);
  });
});
// end of clients.test.ts
