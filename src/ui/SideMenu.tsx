import { TABS } from './shared';
import type { Tab } from './shared';
import { storageKind } from './store';
import './menu.css';

export type MenuAction = 'search' | 'reminders' | 'backup';

interface Props {
  current: Tab;
  onTab: (t: Tab) => void;
  onAction: (a: MenuAction) => void;
  onClose: () => void;
}

const MAIN: Tab[] = ['dashboard', 'causelist', 'cases', 'diary'];
const MANAGE: Tab[] = ['clients', 'analytics'];

export function SideMenu({ current, onTab, onAction, onClose }: Props) {
  const label = (id: Tab) => TABS.find(t => t.id === id)?.label ?? id;
  const tabItem = (id: Tab) => (
    <button
      key={id}
      className={current === id ? 'm-item active' : 'm-item'}
      onClick={() => { onTab(id); onClose(); }}
    >
      {label(id)}
    </button>
  );
  const actionItem = (a: MenuAction, text: string) => (
    <button key={a} className="m-item" onClick={() => { onClose(); onAction(a); }}>
      {text}
    </button>
  );
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
        </div>
        <div className="m-group">MAIN</div>
        {MAIN.map(tabItem)}
        <div className="m-group">TOOLS</div>
        {actionItem('search', 'Search')}
        {actionItem('reminders', 'Reminders')}
        <div className="m-group">MANAGEMENT</div>
        {MANAGE.map(tabItem)}
        <div className="m-group">DATA</div>
        {actionItem('backup', 'Backup & Restore')}
        <div className="m-foot">Storage: {storageKind()}</div>
      </aside>
    </div>
  );
}
// end of SideMenu.tsx
