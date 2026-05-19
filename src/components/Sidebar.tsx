import React from 'react';
import {
  LayoutDashboard, Calendar, Briefcase, FileText,
  Settings, Scale, Menu, X, LogOut, Bot,
  Calculator, TrendingUp, CreditCard, Users,
  BookMarked, Bell, IndianRupee, Search, Mail
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getSettings, AppSettings } from './Settings';

interface Props { activeTab: string; setActiveTab: (t: string) => void; onLogout?: () => void; }

export const Sidebar = ({ activeTab, setActiveTab, onLogout }: Props) => {
  const [open, setOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<AppSettings>(getSettings());

  React.useEffect(() => {
    const h = () => setSettings(getSettings());
    window.addEventListener('settings_update', h);
    return () => window.removeEventListener('settings_update', h);
  }, []);

  const cases = JSON.parse(localStorage.getItem('legal_cases') || '[]');
  const urgentCount = cases.filter((c: any) => c.status === 'Urgent').length;
  const todayCount = cases.filter((c: any) => c.nextDate === new Date().toISOString().split('T')[0]).length;

  const sections = [
    {
      label: 'Main',
      items: [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'diary', icon: Calendar, label: 'Legal Diary', badge: todayCount || null },
        { id: 'cases', icon: Briefcase, label: 'Cases', badge: urgentCount || null, badgeRed: true },
        { id: 'causelist', icon: FileText, label: 'Cause List' },
      ]
    },
    {
      label: 'AI & Tools',
      items: [
        { id: 'ai', icon: Bot, label: 'AI Assistant', isAI: true },
        { id: 'search', icon: Search, label: 'Legal Search' },
        { id: 'judgments', icon: BookMarked, label: 'Judgments' },
        { id: 'calculator', icon: Calculator, label: 'Legal Calculator' },
      ]
    },
    {
      label: 'Documents',
      items: [
        { id: 'vakalatnama', icon: FileText, label: 'Vakalatnama' },
        { id: 'notices', icon: Mail, label: 'Legal Notices' },
      ]
    },
    {
      label: 'Management',
      items: [
        { id: 'clients', icon: Users, label: 'Clients' },
        { id: 'income', icon: IndianRupee, label: 'Income Tracker' },
        { id: 'analytics', icon: TrendingUp, label: 'Analytics' },
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

  const initials = settings.advocateName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'A';

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl shadow-lg"
        style={{ background:'#0a0f1e', border:'1px solid rgba(255,255,255,0.1)' }}>
        {open ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
      </button>

      {open && <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setOpen(false)} />}

      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 lg:translate-x-0 flex flex-col",
        open ? "translate-x-0" : "-translate-x-full"
      )} style={{ background:'linear-gradient(180deg, #0a0f1e 0%, #0d1424 100%)', borderRight:'1px solid rgba(255,255,255,0.05)' }}>

        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-white/5 shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background:'linear-gradient(135deg, #14532d, #16a34a)', boxShadow:'0 0 15px rgba(22,163,74,0.3)' }}>
            <Scale className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-white">Legal Diary</h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Pro Edition</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {sections.map(sec => (
            <div key={sec.label}>
              <p className="text-[9px] uppercase font-black text-zinc-600 tracking-widest px-3 mb-1.5">{sec.label}</p>
              <div className="space-y-0.5">
                {sec.items.map(item => (
                  <button key={item.id}
                    onClick={() => { setActiveTab(item.id); setOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all",
                      activeTab === item.id ? "text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                    )}
                    style={activeTab === item.id ? {
                      background: (item as any).isAI
                        ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
                        : 'linear-gradient(135deg, #14532d, #16a34a)',
                      boxShadow: (item as any).isAI ? '0 4px 12px rgba(124,58,237,0.25)' : '0 4px 12px rgba(22,163,74,0.2)'
                    } : {}}>
                    <div className="flex items-center gap-3">
                      <item.icon size={16} />
                      <span className="font-medium text-sm">{item.label}</span>
                    </div>
                    {(item as any).badge && (
                      <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full text-white', (item as any).badgeRed ? 'bg-red-500' : 'bg-legal-green')}>
                        {(item as any).badge}
                      </span>
                    )}
                    {(item as any).isAI && activeTab !== item.id && (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white bg-gradient-to-r from-purple-500 to-indigo-500">AI</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="p-3 border-t border-white/5 space-y-2 shrink-0">
          <div className="p-3 rounded-2xl flex items-center gap-3"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
              style={{ background:'linear-gradient(135deg, #d4af37, #c5a059)', color:'#0a0f1e' }}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{settings.advocateName || 'Advocate'}</p>
              <p className="text-[10px] text-zinc-500 truncate">{settings.court || 'Set court in Settings'}</p>
            </div>
          </div>
          {onLogout && (
            <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <LogOut size={16} />
              <span className="text-sm font-medium">Logout</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};
