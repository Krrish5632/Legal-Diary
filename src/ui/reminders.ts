import { repo } from './store';
import { ReminderSync, PERMISSION_BLOCKED_HELP, PERMISSION_EXPLANATION } from '../core/remindersync';
import { CapacitorNotify, ensureChannel, askedPermissionBefore } from './notify';

const notify = new CapacitorNotify();
export const reminders = new ReminderSync(repo, notify);

export type ReminderNote = { kind: 'ok' | 'warn' | 'bad' | 'info'; text: string };

export async function syncReminders(opts: { askPermission?: boolean } = {}): Promise<ReminderNote> {
  await ensureChannel();
  const r = await reminders.run(opts);
  if (r.status === 'scheduled') return { kind: r.exact ? 'ok' : 'warn', text: r.message };
  if (r.status === 'permission-needed') return { kind: 'info', text: PERMISSION_EXPLANATION };
  if (r.status === 'permission-denied') return { kind: 'bad', text: PERMISSION_BLOCKED_HELP };
  if (r.status === 'disabled') return { kind: 'ok', text: r.message };
  return { kind: 'bad', text: r.message };
}

export function reminderSettingsHelp(): string {
  return askedPermissionBefore()
    ? 'If the reminder still does not appear, open phone Settings > Apps > Legal Diary Pro > Notifications and allow them. Also allow "Alarms & reminders" for exact timing.'
    : 'After you turn reminders on, the app will ask for permission once. Tap Allow.';
}
// end of reminders.ts
