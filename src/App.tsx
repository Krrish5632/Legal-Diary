import React from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CaseList } from './components/CaseList';
import { Diary } from './components/Diary';
import { CauseListView } from './components/CauseListView';
import { Settings } from './components/Settings';
import { CaseForm } from './components/CaseForm';
import { Login } from './components/Login';
import { AIAssistant } from './components/AIAssistant';
import { Analytics } from './components/Analytics';
import { LegalCalculator } from './components/LegalCalculator';
import { AdvocateCard } from './components/AdvocateCard';
import { HearingNotes } from './components/HearingNotes';
import { LegalSearch } from './components/LegalSearch';
import { JudgmentSearch } from './components/JudgmentSearch';
import { ClientDatabase } from './components/ClientDatabase';
import { VakalatnaMGenerator } from './components/VakalatnaMGenerator';
import { LegalNotices } from './components/LegalNotices';
import { IncomeTracker } from './components/IncomeTracker';
import { LegalCase } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Database } from 'lucide-react';
import { format } from 'date-fns';

const SESSION_KEY = 'ld_session';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [selectedCase, setSelectedCase] = React.useState<LegalCase | undefined>();
  const [notesCase, setNotesCase] = React.useState<LegalCase | undefined>();

  // Storage permission
  React.useEffect(() => {
    const req = async () => {
      try {
        const { Filesystem } = await import('@capacitor/filesystem');
        await Filesystem.requestPermissions();
      } catch { }
    };
    req();
  }, []);

  const handleLoginSuccess = () => { sessionStorage.setItem(SESSION_KEY, '1'); setIsLoggedIn(true); };
  const handleLogout = () => { sessionStorage.removeItem(SESSION_KEY); setIsLoggedIn(false); setActiveTab('dashboard'); };

  if (!isLoggedIn) return <Login onSuccess={handleLoginSuccess} />;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':    return <Dashboard setActiveTab={setActiveTab} />;
      case 'cases':        return <CaseList onAddCase={() => { setSelectedCase(undefined); setIsFormOpen(true); }} onEditCase={(c) => { setSelectedCase(c); setIsFormOpen(true); }} onViewNotes={(c) => setNotesCase(c)} />;
      case 'diary':        return <Diary onAddCase={() => { setSelectedCase(undefined); setIsFormOpen(true); }} />;
      case 'causelist':    return <CauseListView />;
      case 'ai':           return <AIAssistant />;
      case 'analytics':    return <Analytics />;
      case 'calculator':   return <LegalCalculator />;
      case 'card':         return <AdvocateCard />;
      case 'search':       return <LegalSearch />;
      case 'judgments':    return <JudgmentSearch />;
      case 'clients':      return <ClientDatabase />;
      case 'vakalatnama':  return <VakalatnaMGenerator />;
      case 'notices':      return <LegalNotices />;
      case 'income':       return <IncomeTracker />;
      case 'settings':     return <Settings />;
      default: return (
        <div className="flex flex-col items-center justify-center h-full p-20 text-center">
          <h2 className="text-2xl font-display font-bold">Coming Soon</h2>
        </div>
      );
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen overflow-hidden">
        <div className="h-14 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md border-b dark:border-zinc-700 sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 pl-12 lg:pl-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-[9px] font-bold uppercase">
              <Database size={9} /> Offline
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[9px] font-bold uppercase">
              <Shield size={9} /> Secure
            </span>
            {activeTab === 'ai' && (
              <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase"
                style={{ background:'rgba(124,58,237,0.1)', color:'#7c3aed' }}>✨ AI</span>
            )}
          </div>
          <p className="text-[11px] font-bold text-zinc-400">{format(new Date(), 'EEE, dd MMM yyyy')}</p>
        </div>

        <div className="flex-1 overflow-y-auto dark:bg-zinc-900">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.15 }} className="h-full">
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {isFormOpen && <CaseForm onClose={() => { setIsFormOpen(false); setSelectedCase(undefined); }} initialData={selectedCase} />}
        {notesCase && <HearingNotes legalCase={notesCase} onClose={() => setNotesCase(undefined)} />}
      </AnimatePresence>
    </div>
  );
}
