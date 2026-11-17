import { useState } from 'react';
import { shareBytes } from './files';
import type { PdfFile } from './pdf';
import './pdf.css';

type Kind = 'save' | 'print' | 'share';

export function PdfButtons({ make }: { make: () => PdfFile }) {
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);

  async function go(kind: Kind) {
    setMsg('');
    setBad(false);
    let f: PdfFile;
    try {
      f = make();
    } catch (e) {
      setBad(true);
      setMsg('Could not create the PDF: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    const warn = f.warning ? ' ' + f.warning : '';
    try {
      if (kind === 'save') {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMsg('PDF created: ' + f.name + '. Check your Downloads folder.' + warn);
      } else if (kind === 'print') {
        const url = URL.createObjectURL(f.blob);
        const w = window.open(url, '_blank');
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
        if (!w) {
          setBad(true);
          setMsg('The browser blocked the new tab. Allow pop-ups for this page, or use Save PDF.');
        } else {
          setMsg('The PDF opened in a new tab. Use the print button there.' + warn);
        }
      } else {
        const r = await shareBytes(f.name, f.bytes, 'application/pdf');
        if (r === 'shared') setMsg('Shared.' + warn);
        else if (r === 'unsupported') {
          setBad(true);
          setMsg('Sharing is not available here. Use Save PDF instead.');
        }
      }
    } catch (e) {
      setBad(true);
      setMsg('Failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="pdfbar">
      <button type="button" className="pdfbtn" onClick={() => void go('save')}>
        Save PDF
      </button>
      <button type="button" className="pdfbtn" onClick={() => void go('print')}>
        Print
      </button>
      <button type="button" className="pdfbtn" onClick={() => void go('share')}>
        Share PDF
      </button>
      {msg ? <div className={bad ? 'pdfmsg pdfbad' : 'pdfmsg'}>{msg}</div> : null}
    </div>
  );
}
// end of PdfButtons.tsx
