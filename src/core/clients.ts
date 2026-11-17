import type { Repository } from './repository';
import type { CaseRecord } from './types';

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export type ClientInput = Pick<Client, 'name' | 'phone' | 'email' | 'address' | 'notes'>;

const KEY = 'clients_v1';
const norm = (s: string): string => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Never returns an empty list for damaged data: it throws, so nothing is overwritten. */
export async function loadClients(repo: Repository): Promise<Client[]> {
  const raw = await repo.getMeta(KEY);
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('The saved client list is damaged. Nothing was changed.');
  }
  if (!Array.isArray(data)) throw new Error('The saved client list is damaged. Nothing was changed.');
  return data as Client[];
}

async function writeClients(repo: Repository, list: Client[]): Promise<void> {
  await repo.commit({ setMeta: { [KEY]: JSON.stringify(list) } });
}

function newClientId(): string {
  return 'cl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export async function saveClient(
  repo: Repository, input: ClientInput, nowISO: string, id?: string,
): Promise<Client> {
  const list = await loadClients(repo);
  const name = input.name.trim();
  if (!name) throw new Error('Client name is required');
  if (list.some(c => c.id !== id && norm(c.name) === norm(name))) {
    throw new Error('A client with this name already exists');
  }
  const fields = {
    name, phone: input.phone.trim(), email: input.email.trim(),
    address: input.address.trim(), notes: input.notes.trim(),
  };
  let saved: Client;
  if (id) {
    const old = list.find(c => c.id === id);
    if (!old) throw new Error('Client not found');
    saved = { ...old, ...fields, updatedAt: nowISO };
    await writeClients(repo, list.map(c => (c.id === id ? saved : c)));
  } else {
    saved = { id: newClientId(), ...fields, archived: false, createdAt: nowISO, updatedAt: null };
    await writeClients(repo, [...list, saved]);
  }
  return saved;
}

export async function setArchived(repo: Repository, id: string, archived: boolean, nowISO: string): Promise<void> {
  const list = await loadClients(repo);
  if (!list.some(c => c.id === id)) throw new Error('Client not found');
  await writeClients(repo, list.map(c => (c.id === id ? { ...c, archived, updatedAt: nowISO } : c)));
}

export async function addClientsFromNames(repo: Repository, names: string[], nowISO: string): Promise<number> {
  const list = await loadClients(repo);
  const have = new Set(list.map(c => norm(c.name)));
  const add: Client[] = [];
  for (const n of names) {
    const name = n.trim();
    if (!name || have.has(norm(name))) continue;
    have.add(norm(name));
    add.push({
      id: newClientId(), name, phone: '', email: '', address: '', notes: '',
      archived: false, createdAt: nowISO, updatedAt: null,
    });
  }
  if (add.length > 0) await writeClients(repo, [...list, ...add]);
  return add.length;
}

/** Cases where the client's name is the plaintiff or the defendant. */
export function casesForClient(client: Client, cases: CaseRecord[]): CaseRecord[] {
  const n = norm(client.name);
  return cases.filter(c => norm(c.parties.plaintiff ?? '') === n || norm(c.parties.defendant ?? '') === n);
}

export interface Suggestion { name: string; count: number; role: string }

/** Names from the cases that are not clients yet. Only shown to the user, never added automatically. */
export function suggestedNames(cases: CaseRecord[], clients: Client[]): Suggestion[] {
  const have = new Set(clients.map(c => norm(c.name)));
  const m = new Map<string, { name: string; p: number; d: number }>();
  const bump = (raw: string, side: 'p' | 'd') => {
    const name = String(raw ?? '').trim();
    const k = norm(name);
    if (!k || have.has(k)) return;
    const cur = m.get(k) ?? { name, p: 0, d: 0 };
    cur[side] += 1;
    m.set(k, cur);
  };
  for (const c of cases) {
    bump(c.parties.plaintiff ?? '', 'p');
    bump(c.parties.defendant ?? '', 'd');
  }
  return [...m.values()]
    .map(v => ({ name: v.name, count: v.p + v.d, role: v.p && v.d ? 'plaintiff and defendant' : v.p ? 'plaintiff' : 'defendant' }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
// end of clients.ts
