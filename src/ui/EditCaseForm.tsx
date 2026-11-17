import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CaseRecord, CaseType } from '../core/types';
import { updateCaseDetails } from '../core/caseedit';
import { repo } from './store';
import { nowIST } from './dateutil';
import './forms.css';

const TYPES: CaseType[] = ['Civil', 'Criminal', 'Revenue', 'Other'];

interface Form {
  caseNumber: string; caseYear: string; caseType: CaseType; currentProceeding: string;
  courtName: string; courtNumber: string; judgeName: string;
  plaintiff: string; defendant: string; oppositeCounsel: string;
  policeStation: string; firNumber: string; sections: string;
}

const g = (r: Record<string, string>, k: string): string => String(r[k] ?? '');

function Line({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {label}
      <input className="input" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function EditCaseForm({ c, onSaved, onCancel }: {
  c: CaseRecord; onSaved: () => Promise<void>; onCancel: () => void;
}) {
  const [f, setF] = useState<Form>({
    caseNumber: c.caseNumber, caseYear: c.caseYear, caseType: c.caseType, currentProceeding: c.currentProceeding,
    courtName: g(c.court, 'name'), courtNumber: g(c.court, 'number'), judgeName: g(c.court, 'judgeName'),
    plaintiff: g(c.parties, 'plaintiff'), defendant: g(c.parties, 'defendant'), oppositeCounsel: g(c.parties, 'oppositeCounsel'),
    policeStation: g(c.legalSections, 'policeStation'), firNumber: g(c.legalSections, 'firNumber'),
    sections: g(c.legalSections, 'sections'),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function upd<K extends keyof Form>(k: K, v: Form[K]) {
    setF(p => ({ ...p, [k]: v }));
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await updateCaseDetails(repo, c.id, {
        caseNumber: f.caseNumber, caseYear: f.caseYear, caseType: f.caseType, currentProceeding: f.currentProceeding,
        court: { name: f.courtName, number: f.courtNumber, judgeName: f.judgeName },
        parties: { plaintiff: f.plaintiff, defendant: f.defendant, oppositeCounsel: f.oppositeCounsel },
        legalSections: f.caseType === 'Criminal'
          ? { policeStation: f.policeStation, firNumber: f.firNumber, sections: f.sections }
          : {},
      }, nowIST(), 'user');
      await onSaved();
    } catch (e) {
      setErr('Not saved: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="sheet">
        <div className="sheet-head">
          <div className="sheet-title">Edit Case Details</div>
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
        <form className="form" onSubmit={submit}>
          <div className="note">Entry Date and hearing dates cannot be edited here. Every change is written in the change log.</div>
          <div className="form-row">
            <Line label="Case number *" value={f.caseNumber} onChange={v => upd('caseNumber', v)} />
            <Line label="Case year" value={f.caseYear} onChange={v => upd('caseYear', v)} />
          </div>
          <label>
            Case type
            <select className="input" value={f.caseType} onChange={e => upd('caseType', e.target.value as CaseType)}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <Line label="Court name" value={f.courtName} onChange={v => upd('courtName', v)} />
          <div className="form-row">
            <Line label="Court / room number" value={f.courtNumber} onChange={v => upd('courtNumber', v)} />
            <Line label="Judge" value={f.judgeName} onChange={v => upd('judgeName', v)} />
          </div>
          <div className="form-row">
            <Line label="Plaintiff / complainant" value={f.plaintiff} onChange={v => upd('plaintiff', v)} />
            <Line label="Defendant / accused" value={f.defendant} onChange={v => upd('defendant', v)} />
          </div>
          <Line label="Opposite counsel" value={f.oppositeCounsel} onChange={v => upd('oppositeCounsel', v)} />
          {f.caseType === 'Criminal' && (
            <>
              <div className="form-row">
                <Line label="Police station" value={f.policeStation} onChange={v => upd('policeStation', v)} />
                <Line label="FIR number" value={f.firNumber} onChange={v => upd('firNumber', v)} />
              </div>
              <Line label="Sections" value={f.sections} onChange={v => upd('sections', v)} />
            </>
          )}
          <Line label="Current proceeding" value={f.currentProceeding} onChange={v => upd('currentProceeding', v)} />
          {err && <div className="err">{err}</div>}
          <div className="form-buttons">
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
// end of EditCaseForm.tsx
