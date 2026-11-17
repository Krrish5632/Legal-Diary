import type { NotifyPort, PermissionState, ScheduledItem } from '../core/remindersync';

let mod: any | null = null;
let asked = false;

async function load() {
  if (mod) return mod;
  try {
    mod = await import('@capacitor/local-notifications');
    return mod;
  } catch {
    mod = null;
    return null;
  }
}

function mapState(s: string): PermissionState {
  if (s === 'granted') return 'granted';
  if (s === 'denied') return 'denied';
  return 'prompt';
}

/** Real phone notifications. If the plugin cannot load, it does nothing, so the app does not break. */
export class CapacitorNotify implements NotifyPort {
  async checkPermission(): Promise<PermissionState> {
    const m = await load();
    if (!m) return 'granted';
    const r = await m.LocalNotifications.checkPermissions();
    return mapState(r.display);
  }

  async requestPermission(): Promise<PermissionState> {
    asked = true;
    const m = await load();
    if (!m) return 'granted';
    const r = await m.LocalNotifications.requestPermissions();
    return mapState(r.display);
  }

  async canScheduleExact(): Promise<boolean> {
    const m = await load();
    if (!m || !m.LocalNotifications.checkExactNotificationSetting) return true;
    try {
      const r = await m.LocalNotifications.checkExactNotificationSetting();
      if (r.exact_alarm === 'denied') return false;
      return true;
    } catch {
      return true;
    }
  }

  async pendingIds(): Promise<number[]> {
    const m = await load();
    if (!m) return [];
    const r = await m.LocalNotifications.getPending();
    const ids: number[] = [];
    for (const p of r.notifications ?? []) {
      const n = Number(p.id);
      if (Number.isFinite(n)) ids.push(n);
    }
    return ids;
  }

  async cancel(ids: number[]): Promise<void> {
    const m = await load();
    if (!m || ids.length === 0) return;
    await m.LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
  }

  async schedule(items: ScheduledItem[]): Promise<void> {
    const m = await load();
    if (!m || items.length === 0) return;
    await m.LocalNotifications.schedule({
      notifications: items.map(it => ({
        id: it.id,
        title: it.title,
        body: it.body,
        schedule: { at: new Date(it.at), allowWhileIdle: true },
        extra: it.extra,
        smallIcon: 'ic_launcher',
        channelId: 'hearings',
      })),
    });
  }
}

/** Makes the Android notification channel once. Safe to call many times. */
export async function ensureChannel(): Promise<void> {
  const m = await load();
  if (!m || !m.LocalNotifications.createChannel) return;
  try {
    await m.LocalNotifications.createChannel({
      id: 'hearings',
      name: 'Hearing reminders',
      description: 'Reminders the evening before each hearing',
      importance: 5,
      visibility: 1,
    });
  } catch {
    // channel may already exist, or this is a browser
  }
}

/** Calls cb with the extra data of a tapped notification. Returns a function that stops listening. */
export async function listenTaps(cb: (extra: unknown) => void): Promise<() => void> {
  const m = await load();
  if (!m) return () => undefined;
  try {
    const h = await m.LocalNotifications.addListener('localNotificationActionPerformed', (ev: any) => {
      cb(ev && ev.notification ? ev.notification.extra : null);
    });
    return () => { void h.remove(); };
  } catch {
    return () => undefined;
  }
}

export function askedPermissionBefore(): boolean {
  return asked;
}
// end of notify.ts
