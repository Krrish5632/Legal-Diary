import React from 'react';
import {
  FileText, Download, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, Printer
} from 'lucide-react';
import {
  format, addDays, isSameDay, startOfMonth, endOfMonth,
  addMonths, subMonths, isWithinInterval
} from 'date-fns';
import { storage } from '../lib/storage';
import { pdfGenerator } from '../lib/pdf';
import { cn } from '../lib/utils';
import { getSettings } from './Settings';
import { motion, AnimatePresence } from 'motion/react';
import { CaseDetail } from './CaseDetail';
import { LegalCase } from '../types';

export const CauseListView = () => {
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [cases, setCases] = React.useState(storage.getCases());
  const [downloading, setDownloading] = React.useState(false);
  const [view, setView] = React.useState<'daily' | 'monthly'>('daily');
  const [openCase, setOpenCase] = React.useState<LegalCase | null>(null);

  React.useEffect(() => {
    const refresh = () => setCases(storage.getCases());
    window.addEventListener('storage_update', refresh);
    return () => window.removeEventListener('storage_update', refresh);
  }, []);

  const weekStart = (() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - d.getDay());
    return d;
  })();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const todayStr = format(selectedDate, 'yyyy-MM-dd');
  const dayCases = cases.filter(c => c.nextDate === todayStr);

  const mStart = startOfMonth(currentMonth);
  const mEnd = endOfMonth(currentMonth);
  const monthlyCases = cases.filter(c => {
    if (!c.nextDate) return false;
    const d = new Date(c.nextDate + 'T00:00:00');
    return isWithinInterval(d, { start: mStart, end: mEnd });
  });

  const displayCases = view === 'daily' ? dayCases : monthlyCases;

  const handleDownload = async () => {
    if (displayCases.length === 0) return;
    setDownloading(true);
    const name = getSettings().advocateName || 'Advocate';
    try {
      if (view === 'daily') {
        await pdfGenerator.generateCauseList(format(selectedDate, 'yyyy-MM-dd'), dayCases, name);
      } else {
        await pdfGenerator.generateMonthlyCauseList(currentMonth, monthlyCases, name);
      }
    } finally {
      setTimeout(() => setDownloading(false), 3000);
    }
  };

  const handlePrint = () => {
    if (dayCases.length === 0 || view !== 'daily') return;
    const name = getSettings().advocateName || 'Advocate';
    pdfGenerator.printCauseList(format(selectedDate, 'yyyy-MM-dd'), dayCases, name);
  };

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-display font-bold">Cause List</h2>
          <p className="text-zinc-500 text-sm">Case tap karein — details, next date forward, notes, fees.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleDownload}
            disabled={displayCases.length === 0 || downloading}
            className="flex items-center gap-2 px-4 py-2.5 bg-legal-green text-white rounded-xl font-bold shadow-lg shadow-legal-green/20 hover:opacity-90 disabled:opacity-40 transition-all text-sm">
            <Download size={16} />
            {downloading ? 'Saving...' : `${view === 'daily' ? 'Daily' : 'Monthly'} PDF`}
          </button>
          <button onClick={handlePrint}
            disabled={dayCases.length === 0 || view !== 'daily'}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-40 transition-all text-sm">
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-2xl w-fit">
        {(['daily', 'monthly'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={cn('px-5 py-2 rounded-xl text-sm font-bold transition-all',
              view === v ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500')}>
            {v === 'daily' ? '📅 Daily' : '📆 Monthly'}
          </button>
        ))}
      </div>

      {/* Daily - Week Strip */}
      {view === 'daily' && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-zinc-100 shadow-sm">
          <button onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const cnt = cases.filter(c => c.nextDate === format(day, 'yyyy-MM-dd')).length;
              const sel = isSameDay(day, selectedDate);
              return (
                <button key={day.toISOString()} onClick={() => setSelectedDate(day)}
                  className={cn('flex flex-col items-center py-2 rounded-xl transition-all',
                    sel ? 'bg-legal-green text-white shadow-lg' : 'hover:bg-zinc-50 text-zinc-500')}>
                  <span className="text-[9px] uppercase font-bold opacity-60">{format(day, 'EEE')}</span>
                  <span className="text-base font-display font-bold">{format(day, 'd')}</span>
                  {cnt > 0 && (
                    <span className={cn('text-[9px] font-bold px-1.5 rounded-full mt-0.5',
                      sel ? 'bg-white/20 text-white' : 'bg-legal-green/10 text-legal-green')}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Monthly Navigation */}
      {view === 'monthly' && (
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-zinc-100 rounded-xl"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <p className="font-display font-bold text-lg">{format(currentMonth, 'MMMM yyyy')}</p>
            <p className="text-xs text-zinc-500">{monthlyCases.length} cases scheduled</p>
          </div>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-zinc-100 rounded-xl"><ChevronRight size={18} /></button>
        </div>
      )}

      {/* Cases List */}
      <div className="flex-1 bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b bg-zinc-50/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <CalendarIcon size={18} className="text-legal-green" />
            <h3 className="font-display font-bold">
              {view === 'daily' ? format(selectedDate, 'dd MMM yyyy') : format(currentMonth, 'MMMM yyyy')}
            </h3>
          </div>
          <span className="bg-legal-green/10 text-legal-green text-xs font-bold px-3 py-1 rounded-full">
            {displayCases.length} Cases
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayCases.length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {displayCases.map((c, i) => (
                <motion.button key={c.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setOpenCase(c)}
                  className="w-full text-left flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 transition-colors group">

                  <div className="w-9 h-9 rounded-xl bg-legal-green/10 flex items-center justify-center text-sm font-bold text-legal-green shrink-0">
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-900 text-sm leading-tight truncate">
                      {c.parties.plaintiff} <span className="text-zinc-400 font-normal">vs</span> {c.parties.defendant}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5 font-mono truncate">
                      {c.caseNumber} · {c.court.name}
                    </p>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full block',
                      c.status === 'Urgent' ? 'bg-red-50 text-red-500' : 'bg-zinc-100 text-zinc-500')}>
                      {c.status}
                    </span>
                    {view === 'monthly' && c.nextDate && (
                      <p className="text-[10px] text-legal-green font-bold">
                        {format(new Date(c.nextDate + 'T00:00:00'), 'dd MMM')}
                      </p>
                    )}
                  </div>

                  <ChevronRight size={15} className="text-zinc-200 group-hover:text-legal-green transition-colors shrink-0" />
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="w-14 h-14 bg-zinc-50 rounded-full flex items-center justify-center mb-3">
                <FileText size={28} className="text-zinc-200" />
              </div>
              <h3 className="font-display font-bold text-zinc-700">Koi Case Nahi</h3>
              <p className="text-zinc-400 text-sm mt-1">
                {view === 'daily' ? 'Is date par koi hearing nahi hai.' : 'Is mahine koi case schedule nahi.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Case Detail Modal */}
      <AnimatePresence>
        {openCase && (
          <CaseDetail
            legalCase={openCase}
            onClose={() => {
              setOpenCase(null);
              setCases(storage.getCases());
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
