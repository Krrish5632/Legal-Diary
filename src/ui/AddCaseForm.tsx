import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CaseType, Priority } from '../core/types';
import { createCase } from '../core/actions';
import type { NewCaseInput } from '../core/actions';
import { repo } from './store';
import { nowIST } from './dateutil';
import './forms.css';

const TYPES: CaseType[] = ['Civil', 'Criminal', 'Revenue', 'Other'];

interface Form {
  caseNumber: string; caseYear: string; caseType: CaseType;
  courtName: string; courtNumber: string; judgeName: string;
  plaintiff: string; defendant: string; oppositeCounsel: string;
  policeStation: string; firNumber: string; sections: string;
  hearingDate: string; priority: Priority; currentProceeding: string; notes: string;
}

const EMPTY: Form = {
  caseNumber: '', caseYear: '', caseType: 'Civil',
  courtName: '', courtNumber: '', judgeName: '',
  plaintiff: '', defendant: '', oppositeCounsel: '',
  policeStation: '', firNumber: '', sections: '',
  hearingDate: '', priority: 'Normal', currentProceeding: '', notes: '',
};

function Line({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label>
      {label}
      <input className="input" type={type} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function AddCaseForm({ onSaved, onCancel }: {
  onSaved: (id: string) => void | Promise<void>; onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(EMPTY);
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
      const input: NewCaseInput = {
        caseNumber: f.caseNumber, caseYear: f.caseYear, caseType: f.caseType,
        court: { name: f.courtName, number: f.courtNumber, judgeName: f.judgeName },
        parties: { plaintiff: f.plaintiff, defendant: f.defendant, oppositeCounsel: f.oppositeCounsel },
        legalSections: f.caseType === 'Criminal'
          ? { policeStation: f.policeStation, firNumber: f.firNumber, sections: f.sections }
          : {},
        priority: f.priority, currentProceeding: f.currentProceeding, notes: f.notes,
        hearingDate: f.hearingDate,
      };
      const c = await createCase(repo, input, nowIST(), 'user');
      await onSaved(c.id);
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
          <div className="sheet-title">Add New Case</div>
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
        <form className="form" onSubmit={submit}>
          <div className="note">Entry Date is set automatically to today and cannot be edited.</div>
          <div className="form-row">
            <Line label="Case number *" value={f.caseNumber} onChange={v => upd('caseNumber', v)} />
            <Line label="Case year" value={f.caseYear} onChange={v => upd('caseYear', v)} />
          </div>
          <div className="form-row">
            <label>
              Case type
              <select className="input" value={f.caseType} onChange={e => upd('caseType', e.target.value as CaseType)}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select className="input" value={f.priority} onChange={e => upd('priority', e.target.value as Priority)}>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </label>
          </div>
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
          <Line label="Hearing date (first date in the Cause List) *" type="date" value={f.hearingDate} onChange={v => upd('hearingDate', v)} />
          <Line label="Current proceeding" value={f.currentProceeding} onChange={v => upd('currentProceeding', v)} />
          <label>
            Notes
            <textarea className="input" rows={2} value={f.notes} onChange={e => upd('notes', e.target.value)} />
          </label>
          {err && <div className="err">{err}</div>}
          <div className="form-buttons">
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save Case'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
// end of AddCaseForm.tsx
