import React from 'react';
import { Search, BookOpen, ChevronDown, ChevronUp, X, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { judgments, searchJudgments, Judgment } from '../lib/judgmentsData';
import { cn } from '../lib/utils';

const TOPICS = ['ALL','Constitution','Article 21','Bail','Section 302','Section 376','Section 498A','Evidence','Property','Service','FIR'];

const JCard = ({ j }: { j: Judgment }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
      <button onClick={() => setOpen(!open)} className="w-full text-left p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[9px] font-black px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">{j.year}</span>
            <span className="text-[9px] font-black px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">{j.court}</span>
            {j.section && <span className="text-[9px] font-black px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100">{j.section}</span>}
          </div>
          <p className="font-bold text-zinc-900 text-sm leading-tight">{j.name}</p>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">{j.citation}</p>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-400 shrink-0 mt-1" /> : <ChevronDown size={16} className="text-zinc-400 shrink-0 mt-1" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height:0,opacity:0 }} animate={{ height:'auto',opacity:1 }} exit={{ height:0,opacity:0 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-1">Key Holding (English)</p>
                <p className="text-sm text-zinc-700 leading-relaxed">{j.holding_en}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-1">मुख्य निर्णय (हिंदी)</p>
                <p className="text-sm text-zinc-600 leading-relaxed">{j.holding_hi}</p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {j.topics.map(t => (
                  <span key={t} className="text-[9px] px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full font-bold">{t}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const JudgmentSearch = () => {
  const [query, setQuery] = React.useState('');
  const [topic, setTopic] = React.useState('ALL');
  const [results, setResults] = React.useState<Judgment[]>(judgments);

  React.useEffect(() => {
    let r = query.trim() ? searchJudgments(query) : judgments;
    if (topic !== 'ALL') r = r.filter(j => j.topics.some(t => t.toLowerCase().includes(topic.toLowerCase())));
    setResults(r);
  }, [query, topic]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative overflow-hidden p-5 pb-0 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0a0f1e, #1a1a0a)' }}>
        <div className="absolute top-2 right-4 opacity-10"><Scale size={80} className="text-legal-gold" /></div>
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-legal-gold">{judgments.length} Landmark Cases</p>
          <h2 className="text-2xl font-display font-bold text-white">Judgment Search</h2>
        </div>
        <div className="relative z-10 flex gap-2 mt-4 pb-5">
          <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl"
            style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)' }}>
            <Search size={16} className="text-zinc-400 shrink-0" />
            <input className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none"
              placeholder="Case name, section, topic, year..."
              value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')}><X size={14} className="text-zinc-400" /></button>}
          </div>
        </div>
      </div>
      <div className="px-4 py-2.5 bg-white border-b overflow-x-auto shrink-0">
        <div className="flex gap-2" style={{ width:'max-content' }}>
          {TOPICS.map(t => (
            <button key={t} onClick={() => setTopic(t)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all',
                topic === t ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-zinc-500 border border-zinc-100')}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-zinc-400 font-bold">{results.length} judgments</p>
        {results.map((j, i) => (
          <motion.div key={j.id} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay: Math.min(i*0.03, 0.3) }}>
            <JCard j={j} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};
