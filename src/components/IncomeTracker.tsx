import React from 'react';
import { IndianRupee, Plus, Trash2, TrendingUp, TrendingDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { cn } from '../lib/utils';

const KEY = 'legal_income';

interface Entry { id:string; date:string; amount:number; type:'income'|'expense'; category:string; description:string; }

const getEntries = (): Entry[] => JSON.parse(localStorage.getItem(KEY) || '[]');
const saveEntry = (e: Entry) => {
  localStorage.setItem(KEY, JSON.stringify([...getEntries().filter(x=>x.id!==e.id), e]));
};
const delEntry = (id: string) => {
  localStorage.setItem(KEY, JSON.stringify(getEntries().filter(e=>e.id!==id)));
};

const INC_CATS = ['Appearance Fee','Consultation Fee','Drafting Fee','Filing Fee','Vakalatnama Fee','Retainer','Others'];
const EXP_CATS = ['Court Fees Paid','Stamp Duty','Travel','Stationery','Research','Bar Association','Others'];

export const IncomeTracker = () => {
  const [entries, setEntries] = React.useState(getEntries());
  const [showForm, setShowForm] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(format(new Date(),'yyyy-MM'));
  const [activeTab, setActiveTab] = React.useState<'all'|'income'|'expense'>('all');
  const [form, setForm] = React.useState({ date:format(new Date(),'yyyy-MM-dd'), amount:'', type:'income' as const, category:'Appearance Fee', description:'' });

  const refresh = () => setEntries(getEntries());

  const monthDate = new Date(viewMonth + '-01');
  const mStart = startOfMonth(monthDate);
  const mEnd = endOfMonth(monthDate);

  const monthEntries = entries.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return isWithinInterval(d, { start:mStart, end:mEnd });
  });

  const displayed = (activeTab === 'all' ? monthEntries : monthEntries.filter(e => e.type === activeTab))
    .sort((a,b) => b.date.localeCompare(a.date));

  const totalIncome = monthEntries.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const totalExpense = monthEntries.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
  const netProfit = totalIncome - totalExpense;

  const handleSave = () => {
    if (!form.amount || !form.date) return;
    saveEntry({ id:Date.now().toString(), date:form.date, amount:Number(form.amount), type:form.type, category:form.category, description:form.description });
    refresh();
    setShowForm(false);
    setForm({ date:format(new Date(),'yyyy-MM-dd'), amount:'', type:'income', category:'Appearance Fee', description:'' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 shrink-0" style={{ background:'linear-gradient(135deg, #0a0f1e, #0f2d1a)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-legal-gold/20 border border-legal-gold/30 flex items-center justify-center">
              <IndianRupee size={24} className="text-legal-gold" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-legal-gold">Professional</p>
              <h2 className="text-2xl font-display font-bold text-white">Income Tracker</h2>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-legal-gold/20 text-legal-gold border border-legal-gold/30 rounded-xl font-bold text-xs">
            <Plus size={14} /> Add
          </button>
        </div>
        {/* Month selector */}
        <input type="month" value={viewMonth} onChange={e => setViewMonth(e.target.value)}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white outline-none"
          style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)' }} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 p-4 bg-white border-b shrink-0">
        {[
          { label:'Income', value:totalIncome, color:'text-legal-green', bg:'bg-green-50' },
          { label:'Expense', value:totalExpense, color:'text-red-500', bg:'bg-red-50' },
          { label:'Net Profit', value:netProfit, color:netProfit>=0?'text-legal-green':'text-red-500', bg:netProfit>=0?'bg-green-50':'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={cn('p-3 rounded-2xl text-center', s.bg)}>
            <p className="text-[9px] uppercase font-black text-zinc-400 tracking-wider">{s.label}</p>
            <p className={cn('text-base font-display font-bold mt-0.5', s.color)}>
              ₹{Math.abs(s.value).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-white shrink-0">
        {(['all','income','expense'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn('flex-1 py-3 text-xs font-bold capitalize border-b-2 transition-all',
              activeTab===t ? 'border-legal-green text-legal-green' : 'border-transparent text-zinc-400')}>
            {t==='all'?'All':t==='income'?'💰 Income':'💸 Expense'}
          </button>
        ))}
      </div>

      {/* Add Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
            <motion.div initial={{y:60}} animate={{y:0}} exit={{y:60}}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
              <div className="p-5 border-b flex justify-between items-center">
                <h3 className="font-bold text-lg">Add Entry</h3>
                <button onClick={() => setShowForm(false)}><X size={20} className="text-zinc-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(['income','expense'] as const).map(t => (
                    <button key={t} onClick={() => setForm({...form, type:t, category:t==='income'?'Appearance Fee':'Court Fees Paid'})}
                      className={cn('py-3 rounded-2xl font-bold text-sm capitalize transition-all',
                        form.type===t ? t==='income'?'bg-legal-green text-white':'bg-red-500 text-white' : 'bg-zinc-100 text-zinc-500')}>
                      {t==='income'?'💰 Income':'💸 Expense'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 uppercase block mb-1.5">Date</label>
                    <input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-400 uppercase block mb-1.5">Amount (₹)</label>
                    <input type="number" placeholder="0" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-1.5">Category</label>
                  <select value={form.category} onChange={e => setForm({...form,category:e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none">
                    {(form.type==='income'?INC_CATS:EXP_CATS).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-1.5">Description</label>
                  <input placeholder="Case name, client, etc." value={form.description} onChange={e => setForm({...form,description:e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setShowForm(false)} className="py-3.5 bg-zinc-100 text-zinc-600 rounded-2xl font-bold">Cancel</button>
                  <button onClick={handleSave} disabled={!form.amount}
                    className={cn('py-3.5 text-white rounded-2xl font-bold disabled:opacity-40', form.type==='income'?'bg-legal-green':'bg-red-500')}>
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <IndianRupee size={36} className="text-zinc-200 mb-3" />
            <p className="text-zinc-400 font-bold">No entries this month</p>
          </div>
        ) : displayed.map((e, i) => (
          <motion.div key={e.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}}
            className="flex items-center gap-3 bg-white border border-zinc-100 rounded-2xl p-4 shadow-sm">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', e.type==='income'?'bg-green-50':'bg-red-50')}>
              {e.type==='income' ? <TrendingUp size={18} className="text-legal-green" /> : <TrendingDown size={18} className="text-red-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-zinc-900">{e.category}</p>
              <p className="text-xs text-zinc-400 truncate">{e.description || format(new Date(e.date+'T00:00:00'),'dd MMM yyyy')}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('font-display font-bold text-base', e.type==='income'?'text-legal-green':'text-red-500')}>
                {e.type==='income'?'+':'-'}₹{e.amount.toLocaleString()}
              </p>
              <p className="text-[10px] text-zinc-400">{format(new Date(e.date+'T00:00:00'),'dd MMM')}</p>
            </div>
            <button onClick={() => { delEntry(e.id); refresh(); }} className="p-1.5 text-zinc-200 hover:text-red-500 transition-all">
              <Trash2 size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
