import React from 'react';
import { Search, BookOpen, Scale, Shield, ChevronDown, ChevronUp, X, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { legalSections, LegalSection } from '../lib/legalData';
import { cn } from '../lib/utils';

const ACT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  IPC:          { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
  BNSS:         { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  BSA:          { bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200' },
  CPC:          { bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200' },
  CONSTITUTION: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
};

const SectionCard = ({ s }: { s: LegalSection }) => {
  const [open, setOpen] = React.useState(false);
  const c = ACT_COLORS[s.act] || ACT_COLORS.IPC;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left p-4 flex items-start gap-3">
        <div className={cn('px-2.5 py-1 rounded-lg text-xs font-black shrink-0 border whitespace-nowrap', c.bg, c.text, c.border)}>
          {s.act} §{s.section}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-zinc-900 text-sm leading-tight">{s.title_en}</p>
          <p className="text-zinc-500 text-xs mt-0.5 leading-tight">{s.title_hi}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {s.cognizable !== undefined && (
              <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded-full',
                s.cognizable ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100')}>
                {s.cognizable ? '🔴 Cognizable' : '🟢 Non-Cognizable'}
              </span>
            )}
            {s.bailable !== undefined && (
              <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded-full',
                s.bailable ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-orange-50 text-orange-600 border border-orange-100')}>
                {s.bailable ? '✓ Bailable' : '✗ Non-Bailable'}
              </span>
            )}
            {s.compoundable && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                ⚖ Compoundable
              </span>
            )}
          </div>
        </div>
        <span className="text-zinc-400 shrink-0 mt-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 pt-3">
              {/* English Description */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">English</p>
                <p className="text-sm text-zinc-700 leading-relaxed">{s.description_en}</p>
              </div>

              {/* Hindi Description */}
              {s.description_hi && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">हिंदी</p>
                  <p className="text-sm text-zinc-600 leading-relaxed">{s.description_hi}</p>
                </div>
              )}

              {/* Punishment */}
              {s.punishment_en && (
                <div className="flex items-start gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <Shield size={14} className="text-legal-gold shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Punishment / दंड</p>
                    <p className="text-sm font-bold text-zinc-800 mt-0.5">{s.punishment_en}</p>
                    {s.punishment_hi && (
                      <p className="text-xs text-zinc-500 mt-0.5">{s.punishment_hi}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

type ActFilter = 'ALL' | LegalSection['act'];

export const LegalSearch = () => {
  const [query, setQuery] = React.useState('');
  const [actFilter, setActFilter] = React.useState<ActFilter>('ALL');
  const [bailFilter, setBailFilter] = React.useState<'ALL' | 'bailable' | 'nonbailable'>('ALL');
  const [results, setResults] = React.useState<LegalSection[]>([]);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);

  const acts: ActFilter[] = ['ALL', 'IPC', 'BNSS', 'BSA', 'CPC', 'CONSTITUTION'];

  const doSearch = React.useCallback((q: string, act: ActFilter, bail: string) => {
    const trimmed = q.trim().toLowerCase();
    let filtered = legalSections;

    // Act filter
    if (act !== 'ALL') {
      filtered = filtered.filter(s => s.act === act);
    }

    // Bail filter
    if (bail === 'bailable') filtered = filtered.filter(s => s.bailable === true);
    if (bail === 'nonbailable') filtered = filtered.filter(s => s.bailable === false);

    // Text search
    if (trimmed) {
      filtered = filtered.filter(s =>
        s.section.toLowerCase().includes(trimmed) ||
        s.title_en.toLowerCase().includes(trimmed) ||
        s.title_hi.includes(q.trim()) ||
        s.description_en.toLowerCase().includes(trimmed) ||
        s.description_hi.includes(q.trim()) ||
        s.act.toLowerCase().includes(trimmed) ||
        (s.punishment_en?.toLowerCase().includes(trimmed)) ||
        (s.chapter?.toLowerCase().includes(trimmed))
      );
    }

    setResults(filtered.slice(0, 30));
    setHasSearched(true);
  }, []);

  // Live search
  React.useEffect(() => {
    if (query.trim().length >= 2 || actFilter !== 'ALL' || bailFilter !== 'ALL') {
      doSearch(query, actFilter, bailFilter);
    } else if (query.trim().length === 0 && actFilter === 'ALL' && bailFilter === 'ALL') {
      setHasSearched(false);
      setResults([]);
    }
  }, [query, actFilter, bailFilter, doSearch]);

  const totalSections = legalSections.length;
  const actCounts = acts.filter(a => a !== 'ALL').reduce((acc, a) => {
    acc[a] = legalSections.filter(s => s.act === a).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      {/* Header */}
      <div className="relative overflow-hidden p-5 pb-0 shrink-0"
        style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #14532d 100%)' }}>
        <div className="absolute top-2 right-4 opacity-10">
          <Scale size={80} className="text-legal-gold" />
        </div>
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-legal-gold">Offline Database</p>
          <h2 className="text-2xl font-display font-bold text-white">Legal Search</h2>
          <p className="text-zinc-400 text-xs mt-1">{totalSections} sections — IPC · BNSS · BSA · CPC · Constitution</p>
        </div>

        {/* Search Bar */}
        <div className="relative z-10 flex gap-2 mt-4 pb-5">
          <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <Search size={16} className="text-zinc-400 shrink-0" />
            <input
              className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none"
              placeholder="Section number, keyword, title... (Hindi/English)"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn('px-3 py-3 rounded-2xl transition-all', showFilters
              ? 'bg-legal-green text-white'
              : 'text-zinc-300')}
            style={!showFilters ? { background: 'rgba(255,255,255,0.1)' } : {}}>
            <Filter size={18} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white border-b overflow-hidden shrink-0">
            <div className="p-4 space-y-3">
              {/* Act Filter */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Act</p>
                <div className="flex gap-2 flex-wrap">
                  {acts.map(act => (
                    <button key={act} onClick={() => setActFilter(act)}
                      className={cn('px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                        actFilter === act ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200')}>
                      {act === 'ALL' ? `All (${totalSections})` : `${act} (${actCounts[act] || 0})`}
                    </button>
                  ))}
                </div>
              </div>
              {/* Bail Filter */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Bail Type</p>
                <div className="flex gap-2">
                  {[['ALL', 'All'], ['bailable', 'Bailable'], ['nonbailable', 'Non-Bailable']].map(([v, l]) => (
                    <button key={v} onClick={() => setBailFilter(v as any)}
                      className={cn('px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                        bailFilter === v ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Act Quick Tabs */}
      <div className="bg-white border-b px-4 py-2.5 flex gap-2 overflow-x-auto shrink-0">
        {acts.map(act => {
          const colors = act !== 'ALL' ? ACT_COLORS[act] : null;
          return (
            <button key={act} onClick={() => setActFilter(act)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0',
                actFilter === act
                  ? act === 'ALL' ? 'bg-zinc-900 text-white' : cn(colors?.bg, colors?.text, colors?.border, 'border')
                  : 'bg-zinc-50 text-zinc-500 border border-zinc-100')}>
              {act === 'ALL' ? '📚 All Acts' : act}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Initial State */}
        {!hasSearched && (
          <div className="space-y-4">
            <p className="text-[10px] uppercase font-black text-zinc-400 tracking-widest">Popular Sections</p>
            {['ipc-302', 'ipc-376', 'ipc-420', 'ipc-498a', 'bnss-438', 'bsa-25', 'const-21', 'cpc-151'].map(id => {
              const s = legalSections.find(x => x.id === id);
              return s ? <SectionCard key={s.id} s={s} /> : null;
            })}
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-zinc-500">
                {results.length} result{results.length !== 1 ? 's' : ''} found
                {query && ` for "${query}"`}
              </p>
              {results.length === 30 && (
                <p className="text-[10px] text-zinc-400">Showing first 30</p>
              )}
            </div>

            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen size={40} className="text-zinc-200 mb-3" />
                <p className="font-bold text-zinc-500">No sections found</p>
                <p className="text-sm text-zinc-400 mt-1">Try different keywords or change filters</p>
                <button onClick={() => { setQuery(''); setActFilter('ALL'); setBailFilter('ALL'); }}
                  className="mt-4 px-4 py-2 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-bold">
                  Clear Search
                </button>
              </div>
            ) : (
              results.map((s, i) => (
                <motion.div key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                  <SectionCard s={s} />
                </motion.div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};
