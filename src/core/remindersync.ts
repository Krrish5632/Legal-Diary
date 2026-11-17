import type { Repository } from './repository';
import type { PlannedReminder } from './reminders';
import { loadPrefs, planReminders } from './reminders';
import { isYMD } from './dates';

export type PermissionState = 'granted' | 'denied' | 'prompt';

/** One notification, as the phone layer needs it. */
export interface ScheduledItem {
  id: number;
  at: string; // ISO time with +05:30
  title: string;
  body: string;
  extra: { caseId: string | null; date: string };
}

/**
 * The only thing ReminderSync needs from the phone.
 * The real version (Capacitor Local Notifications) is added later.
 * Tests use a fake one.
 */
export interface NotifyPort {
  checkPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  canScheduleExact(): Promise<boolean>;
  pendingIds(): Promise<number[]>;
  cancel(ids: number[]): Promise<void>;
  schedule(items: ScheduledItem[]): Promise<void>;
}

export type SyncStatus = 'scheduled' | 'disabled' | 'permission-needed' | 'permission-denied' | 'failed';

export interface SyncResult {
  status: SyncStatus;
  scheduled: number;
  cancelled: number;
  exact: boolean;
  message: string;
}

export const PERMISSION_EXPLANATION =
  'Legal Diary Pro can remind you the evening before each hearing (5:00 PM by default). '
  + 'For that, Android needs your permission to show notifications. Nothing is sent over the internet.';

export const PERMISSION_BLOCKED_HELP =
  'Notifications are blocked for this app, so no reminder can appear. '
  + 'Open phone Settings > Apps > Legal Diary Pro > Notifications and allow them.';

function toItem(p: PlannedReminder): ScheduledItem {
  return {
    id: p.id, at: p.at, title: p.title, body: p.body,
    extra: { caseId: p.openCaseId, date: p.hearingDate },
  };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Keeps the phone's notifications equal to the plan made from the saved data.
 * Safe to run any number of times: it cancels what is pending and sets exactly the plan.
 * Runs started together are done one after another.
 */
export class ReminderSync {
  private readonly repo: Repository;
  private readonly port: NotifyPort;
  private readonly clock: () => Date;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(repo: Repository, port: NotifyPort, clock: () => Date = () => new Date()) {
    this.repo = repo;
    this.port = port;
    this.clock = clock;
  }

  run(opts: { askPermission?: boolean } = {}): Promise<SyncResult> {
    const p = this.queue.then(() => this.once(opts));
    this.queue = p.then(() => undefined, () => undefined);
    return p;
  }

  private async once(opts: { askPermission?: boolean }): Promise<SyncResult> {
    try {
      const prefs = await loadPrefs(this.repo);
      const pending = [...new Set(await this.port.pendingIds())];

      if (!prefs.enabled) {
        if (pending.length > 0) await this.port.cancel(pending);
        return {
          status: 'disabled', scheduled: 0, cancelled: pending.length, exact: true,
          message: 'Reminders are switched off.',
        };
      }

      const cases = await this.repo.listCases();
      const hearings = await this.repo.listHearings();
      const plan = planReminders(cases, hearings, prefs, this.clock());

      if (plan.length === 0) {
        if (pending.length > 0) await this.port.cancel(pending);
        return {
          status: 'scheduled', scheduled: 0, cancelled: pending.length, exact: true,
          message: 'No upcoming hearing needs a reminder right now.',
        };
      }

      let perm = await this.port.checkPermission();
      if (perm === 'prompt' && opts.askPermission) perm = await this.port.requestPermission();

      if (perm === 'denied') {
        if (pending.length > 0) await this.port.cancel(pending);
        return {
          status: 'permission-denied', scheduled: 0, cancelled: pending.length, exact: false,
          message: PERMISSION_BLOCKED_HELP,
        };
      }
      if (perm === 'prompt') {
        return {
          status: 'permission-needed', scheduled: 0, cancelled: 0, exact: false,
          message: PERMISSION_EXPLANATION,
        };
      }

      const exact = await this.port.canScheduleExact();
      if (pending.length > 0) await this.port.cancel(pending);
      await this.port.schedule(plan.map(toItem));

      const after = await this.port.pendingIds();
      const got = new Set(after);
      const ok = after.length === plan.length && plan.every(p => got.has(p.id));
      if (!ok) {
        const kept = plan.filter(p => got.has(p.id)).length;
        return {
          status: 'failed', scheduled: kept, cancelled: pending.length, exact,
          message: 'Only ' + kept + ' of ' + plan.length
            + ' reminders were confirmed by the phone. They will be checked again when the app opens.',
        };
      }

      let message = plan.length + ' reminder(s) set.';
      if (!exact) {
        message += ' Android may deliver them a few minutes late. '
          + 'Allow "Alarms & reminders" for this app for exact timing.';
      }
      return { status: 'scheduled', scheduled: plan.length, cancelled: pending.length, exact, message };
    } catch (e) {
      return {
        status: 'failed', scheduled: 0, cancelled: 0, exact: false,
        message: 'Reminders could not be set: ' + errText(e) + '. They will be tried again when the app opens.',
      };
    }
  }
}

/** Reads what a tapped notification carries. Anything odd gives nulls, never an error. */
export function parseTapTarget(extra: unknown): { caseId: string | null; date: string | null } {
  if (typeof extra !== 'object' || extra === null) return { caseId: null, date: null };
  const o = extra as Record<string, unknown>;
  const caseId = typeof o.caseId === 'string' && o.caseId.length > 0 && o.caseId.length <= 200 ? o.caseId : null;
  const date = typeof o.date === 'string' && isYMD(o.date) ? o.date : null;
  return { caseId, date };
}
// end of remindersync.ts
