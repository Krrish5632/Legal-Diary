import { describe, it, expect } from 'vitest';
import { MemoryRepository } from './repository';
import { savePrefs, DEFAULT_PREFS } from './reminders';
import { ReminderSync, parseTapTarget } from './remindersync';
import type { NotifyPort, PermissionState, ScheduledItem } from './remindersync';
import { mkCase, mkHearing } from './sqltestkit';

// 17 Nov 2026, 11:30 India time
const NOW = new Date('2026-11-17T06:00:00Z');
const clock = () => NOW;

class FakePort implements NotifyPort {
  perm: PermissionState = 'granted';
  requestResult: PermissionState = 'granted';
  exact = true;
  items: ScheduledItem[] = [];
  failSchedule = false;
  dropFirst = false;
  scheduleCalls = 0;
  requestCalls = 0;
  async checkPermission() { return this.perm; }
  async requestPermission() {
    this.requestCalls += 1;
    this.perm = this.requestResult;
    return this.perm;
  }
  async canScheduleExact() { return this.exact; }
  async pendingIds() { await Promise.resolve(); return this.items.map(i => i.id); }
  async cancel(ids: number[]) {
    await Promise.resolve();
    const s = new Set(ids);
    this.items = this.items.filter(i => !s.has(i.id));
  }
  async schedule(items: ScheduledItem[]) {
    await Promise.resolve();
    this.scheduleCalls += 1;
    if (this.failSchedule) throw new Error('phone said no');
    const list = this.dropFirst ? items.slice(1) : items;
    this.items.push(...list);
  }
}

async function setup() {
  const repo = new MemoryRepository();
  await repo.commit({
    putCases: [
      mkCase('c1', { priority: 'High', caseNumber: 'B-1' }),
      mkCase('c2', { caseNumber: 'A-1' }),
      mkCase('c3', { caseNumber: 'C-1' }),
    ],
    putHearings: [
      mkHearing('c1', '2026-11-20'),
      mkHearing('c2', '2026-11-20'),
      mkHearing('c3', '2026-11-25'),
    ],
  });
  const port = new FakePort();
  return { repo, port, sync: new ReminderSync(repo, port, clock) };
}

describe('ReminderSync', () => {
  it('sets one reminder per hearing date, high priority first', async () => {
    const { port, sync } = await setup();
    const r = await sync.run();
    expect(r.status).toBe('scheduled');
    expect(r.scheduled).toBe(2);
    const items = port.items.slice().sort((a, b) => a.id - b.id);
    expect(items.map(i => i.id)).toEqual([20261120, 20261125]);
    expect(items[0].body.split('\n')).toEqual(['High - B-1', 'A-1']);
    expect(items[0].at).toBe('2026-11-19T17:00:00+05:30');
    expect(items[0].extra).toEqual({ caseId: null, date: '2026-11-20' });
    expect(items[1].extra).toEqual({ caseId: 'c3', date: '2026-11-25' });
  });

  it('is safe to run twice: no duplicates', async () => {
    const { port, sync } = await setup();
    await sync.run();
    await sync.run();
    await sync.run();
    expect(port.items.length).toBe(2);
    expect(new Set(port.items.map(i => i.id)).size).toBe(2);
  });

  it('moves the reminder when a hearing date changes', async () => {
    const { repo, port, sync } = await setup();
    await sync.run();
    await repo.commit({
      putHearings: [mkHearing('c3', '2026-11-25', 'completed'), mkHearing('c3', '2026-12-02')],
    });
    await sync.run();
    expect(port.items.map(i => i.id).sort()).toEqual([20261120, 20261202]);
  });

  it('removes everything when reminders are switched off', async () => {
    const { repo, port, sync } = await setup();
    await sync.run();
    await savePrefs(repo, { ...DEFAULT_PREFS, enabled: false });
    const r = await sync.run();
    expect(r.status).toBe('disabled');
    expect(r.cancelled).toBe(2);
    expect(port.items.length).toBe(0);
  });

  it('skips muted cases and muted dates', async () => {
    const { repo, port, sync } = await setup();
    await savePrefs(repo, { ...DEFAULT_PREFS, mutedCases: ['c1'], mutedDates: ['2026-11-25'] });
    await sync.run();
    expect(port.items.map(i => i.id)).toEqual([20261120]);
    expect(port.items[0].body).toBe('A-1');
  });

  it('says so when notifications are blocked, and sets nothing', async () => {
    const { port, sync } = await setup();
    port.perm = 'denied';
    const r = await sync.run();
    expect(r.status).toBe('permission-denied');
    expect(r.message).toContain('Settings');
    expect(port.scheduleCalls).toBe(0);
    expect(port.items.length).toBe(0);
  });

  it('asks for permission only when told to', async () => {
    const { port, sync } = await setup();
    port.perm = 'prompt';
    const first = await sync.run();
    expect(first.status).toBe('permission-needed');
    expect(port.requestCalls).toBe(0);
    expect(port.items.length).toBe(0);
    const second = await sync.run({ askPermission: true });
    expect(second.status).toBe('scheduled');
    expect(port.requestCalls).toBe(1);
    expect(port.items.length).toBe(2);
  });

  it('reports a refusal when the user says no', async () => {
    const { port, sync } = await setup();
    port.perm = 'prompt';
    port.requestResult = 'denied';
    const r = await sync.run({ askPermission: true });
    expect(r.status).toBe('permission-denied');
    expect(port.items.length).toBe(0);
  });

  it('reports a failure without throwing when the phone cannot schedule', async () => {
    const { port, sync } = await setup();
    port.failSchedule = true;
    const r = await sync.run();
    expect(r.status).toBe('failed');
    expect(r.message).toContain('phone said no');
  });

  it('notices when the phone did not keep all reminders', async () => {
    const { port, sync } = await setup();
    port.dropFirst = true;
    const r = await sync.run();
    expect(r.status).toBe('failed');
    expect(r.message).toContain('confirmed');
    expect(r.scheduled).toBe(1);
  });

  it('runs started together leave one reminder per date', async () => {
    const { port, sync } = await setup();
    await Promise.all([sync.run(), sync.run(), sync.run(), sync.run(), sync.run()]);
    expect(port.items.length).toBe(2);
    expect(new Set(port.items.map(i => i.id)).size).toBe(2);
  });

  it('still sets reminders when exact alarms are not allowed, and says so', async () => {
    const { port, sync } = await setup();
    port.exact = false;
    const r = await sync.run();
    expect(r.status).toBe('scheduled');
    expect(r.exact).toBe(false);
    expect(r.message).toMatch(/late/);
    expect(port.items.length).toBe(2);
  });

  it('clears leftover reminders when nothing is upcoming', async () => {
    const repo = new MemoryRepository();
    const port = new FakePort();
    port.items.push({
      id: 1, at: '2026-11-18T17:00:00+05:30', title: 't', body: 'b', extra: { caseId: null, date: '2026-11-19' },
    });
    const r = await new ReminderSync(repo, port, clock).run();
    expect(r.status).toBe('scheduled');
    expect(r.scheduled).toBe(0);
    expect(r.cancelled).toBe(1);
    expect(port.items.length).toBe(0);
  });
});

describe('parseTapTarget', () => {
  it('reads the case id and the date', () => {
    expect(parseTapTarget({ caseId: 'c1', date: '2026-11-20' })).toEqual({ caseId: 'c1', date: '2026-11-20' });
    expect(parseTapTarget({ caseId: null, date: '2026-11-20' })).toEqual({ caseId: null, date: '2026-11-20' });
  });

  it('gives nulls for anything odd', () => {
    expect(parseTapTarget(null)).toEqual({ caseId: null, date: null });
    expect(parseTapTarget('x')).toEqual({ caseId: null, date: null });
    expect(parseTapTarget({ caseId: 5, date: 'bad' })).toEqual({ caseId: null, date: null });
  });
});
// end of remindersync.test.ts
