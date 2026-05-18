import React from 'react';
import {
  LayoutDashboard, Calendar, Briefcase,
  FileText, Settings, Scale, Menu, X,
  LogOut, Bot, Calculator, TrendingUp,
  CreditCard, Gavel
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getSettings, AppSettings } from './Settings';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout?: () => void;
}

export const Sidebar = ({ activeTab, setActiveTab, onLogout }: SidebarProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<AppSettings>(getSettings());

  React.useEffect(() => {
    const handler = () => setSettings(getSettings());
    window.addEventListener('settings_update', handler);
    return () => window.removeEventListener('settings_update', handler);
  }, []);

  const cases = JSON.parse(localStorage.getItem('legal_cases') || '[]');
  const urgentCount = cases.filter((c: any) => c.status === 'Urgent').length;
  const todayCount = cases.filter((c: any) => c.nextDate === new Date().toISOString().split('T')[0]).length;

  const menuSections = [
    {
      label: 'Main',
      items: [
        { id: 'search', icon: Search, label: 'Legal Search' },
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'diary', icon: Calendar, label: 'Legal Diary', badge: todayCount > 0 ? todayCount : null },
        { id: 'cases', icon: Briefcase, label: 'Cases', badge: urgentCount > 0 ? urgentCount : null, badgeColor: 'bg-red-500' },
        { id: 'causelist', icon: FileText, label: 'Cause List' },
      ]
    },
    {
      label: 'Tools',
      items: [
        { id: 'ai', icon: Bot, label: 'AI Assistant', badge: null, badgeColor: '', gradient: 'from-purple-500 to-indigo-600' },
        { id: 'analytics', icon: TrendingUp, label: 'Analytics' },
        { id: 'calculator', icon: Calculator, label: 'Legal Calculator' },
        { id: 'card', icon: CreditCard, label: 'Profile Card' },
      ]
    },
    {
      label: 'Account',
      items: [
        { id: 'settings', icon: Settings, label: 'Settings' },
      ]
    }
  ];

  const initials = settings.advocateName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'A';

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl shadow-lg"
        style={{ background: '#0a0f1e', border: '1px solid rgba(255,255,255,0.1)' }}>
        {isOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
      </button>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)} />
      )}

      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )} style={{ background: 'linear-gradient(180deg, #0a0f1e 0%, #0d1424 100%)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-white/5 shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #14532d, #16a34a)', boxShadow: '0 0 15px rgba(22,163,74,0.3)' }}>
            <Scale className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-white">Legal Diary</h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Pro Edition</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {menuSections.map(section => (
            <div key={section.label}>
              <p className="text-[9px] uppercase font-black text-zinc-600 tracking-widest px-3 mb-2">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <button key={item.id}
                    onClick={() => { setActiveTab(item.id); setIsOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left",
                      activeTab === item.id ? "text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                    )}
                    style={activeTab === item.id ? {
                      background: (item as any).gradient
                        ? `linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to))`
                        : 'linear-gradient(135deg, #14532d, #16a34a)',
                      boxShadow: '0 4px 12px rgba(22,163,74,0.2)'
                    } : {}}>
                    <div className="flex items-center gap-3">
                      <item.icon size={17} />
                      <span className="font-medium text-sm">{item.label}</span>
                    </div>
                    {(item as any).badge && (
                      <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full text-white', (item as any).badgeColor || 'bg-legal-green')}>
                        {(item as any).badge}
                      </span>
                    )}
                    {item.id === 'ai' && activeTab !== 'ai' && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white bg-gradient-to-r from-purple-500 to-indigo-500">AI</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile + Logout */}
        <div className="p-3 border-t border-white/5 space-y-2 shrink-0">
          <div className="p-3 rounded-2xl flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
              style={{ background: 'linear-gradient(135deg, #d4af37, #c5a059)', color: '#0a0f1e' }}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{settings.advocateName || 'Advocate'}</p>
              <p className="text-[10px] text-zinc-500 truncate">{settings.court || 'Set court in Settings'}</p>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <LogOut size={16} />
              <span className="text-sm font-medium">Logout</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};
