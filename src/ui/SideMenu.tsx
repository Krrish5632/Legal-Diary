import { TABS } from './shared';
import type { Tab } from './shared';
import { storageKind } from './store';
import './menu.css';

export type MenuAction = 'search' | 'reminders' | 'backup';

interface Props {
  current: Tab;
  caseCount: number;
  onTab: (t: Tab) => void;
  onAction: (a: MenuAction) => void;
  onClose: () => void;
}

const ICON: Record<string, string> = {
  dashboard: '\uD83D\uDCCA',
  causelist: '\u2696\uFE0F',
  cases: '\uD83D\uDCC1',
  diary: '\uD83D\uDCC5',
  clients: '\uD83D\uDC65',
  analytics: '\uD83D\uDCC8',
};
const SUB: Record<string, string> = {
  dashboard: 'Overview',
  causelist: 'Hearings by date',
  cases: 'All your cases',
  diary: 'Daily diary',
  clients: 'Your clients',
  analytics: 'Numbers and charts',
};

const MAIN: Tab[] = ['dashboard', 'causelist', 'cases', 'diary'];
const MANAGE: Tab[] = ['clients', 'analytics'];

export function SideMenu({ current, caseCount, onTab, onAction, onClose }: Props) {
  const label = (id: Tab) => TABS.find(t => t.id === id)?.label ?? id;
  const tile = (
    key: string, icon: string, text: string, sub: string,
    active: boolean, onClick: () => void, wide?: boolean,
  ) => (
    <button
      key={key}
      className={'m-tile' + (active ? ' active' : '') + (wide ? ' wide' : '')}
      onClick={onClick}
    >
      <span className="m-ico">{icon}</span>
      <span className="m-txt">{text}</span>
      <span className="m-subtxt">{sub}</span>
    </button>
  );
  const tabTile = (id: Tab) =>
    tile(id, ICON[id] ?? '', label(id), SUB[id] ?? '', current === id, () => { onTab(id); onClose(); });
  const actionTile = (a: MenuAction, icon: string, text: string, sub: string, wide?: boolean) =>
    tile(a, icon, text, sub, false, () => { onClose(); onAction(a); }, wide);
  return (
    <div className="m-overlay" onClick={onClose}>
      <aside
        className="m-drawer"
        role="dialog"
        aria-label="Menu"
        onClick={e => e.stopPropagation()}
      >
        <div className="m-head">
          <div className="m-title">Legal Diary Pro</div>
          <div className="m-sub">Your cases, hearings and reminders</div>
          <div className="m-count">{caseCount} cases in your diary</div>
        </div>
        <div className="m-group">MAIN</div>
        <div className="m-grid">{MAIN.map(tabTile)}</div>
        <div className="m-group">TOOLS</div>
        <div className="m-grid">
          {actionTile('search', '\uD83D\uDD0D', 'Search', 'Find anything')}
          {actionTile('reminders', '\uD83D\uDD14', 'Reminders', 'Alerts and alarms')}
        </div>
        <div className="m-group">MANAGEMENT</div>
        <div className="m-grid">{MANAGE.map(tabTile)}</div>
        <div className="m-group">DATA</div>
        <div className="m-grid">
          {actionTile('backup', '\uD83D\uDCBE', 'Backup & Restore', 'Save or restore all data', true)}
        </div>
        <div className="m-foot">Storage: {storageKind()}</div>
      </aside>
    </div>
  );
}
// end of SideMenu.tsx
