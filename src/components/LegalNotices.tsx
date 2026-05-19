import React from 'react';
import { Mail, Copy, Check, Share2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSettings } from './Settings';
import { format, addDays } from 'date-fns';
import { cn } from '../lib/utils';

const TEMPLATES = [
  {
    id: 'ni138',
    title: 'Cheque Bounce — NI Act S.138',
    icon: '💳',
    color: 'bg-red-50 border-red-200 text-red-700',
    fields: ['complainantName', 'chequeNo', 'chequeDate', 'bankName', 'amount', 'noticeeeName', 'noticeDate'],
    generate: (f: any, adv: any) => `LEGAL NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881

From:
${adv.advocateName}
Advocate — Bar No. ${adv.barNumber}
${adv.court}

Date: ${format(new Date(f.noticeDate + 'T00:00:00'), 'dd MMMM yyyy')}

To,
${f.noticeeeName}
_________________________ (Address)

Sir/Madam,

Under the instructions of and on behalf of my client ${f.complainantName}, I hereby serve upon you this legal notice as under:

1. That my client issued Cheque No. ${f.chequeNo} dated ${f.chequeDate} drawn on ${f.bankName} for a sum of Rs. ${f.amount}/- (Rupees ${f.amount} only) towards discharge of legally enforceable debt/liability.

2. That the aforesaid cheque when presented for encashment was DISHONOURED by the bank with remarks "Insufficient Funds / Payment Stopped / Account Closed."

3. That you are thereby in violation of Section 138 of the Negotiable Instruments Act, 1881.

4. You are hereby CALLED UPON to pay the aforesaid sum of Rs. ${f.amount}/- to my client within FIFTEEN (15) DAYS from the receipt of this notice.

5. PLEASE TAKE NOTICE that in case of your failure to comply with this demand within the stipulated period, my client shall be constrained to initiate criminal proceedings against you under Section 138 of the NI Act, 1881 read with Section 142, without further notice, and you shall be liable for consequences including imprisonment up to 2 years and/or fine up to twice the amount of the cheque.

Yours faithfully,
${adv.advocateName}
Advocate`
  },
  {
    id: 'money',
    title: 'Money Recovery / Demand Notice',
    icon: '💰',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    fields: ['senderName', 'receiverName', 'amount', 'loanDate', 'dueDate', 'noticeDate'],
    generate: (f: any, adv: any) => `LEGAL NOTICE FOR RECOVERY OF MONEY

From:
${adv.advocateName}, Advocate
Bar No. ${adv.barNumber}
${adv.court}

Date: ${format(new Date(f.noticeDate + 'T00:00:00'), 'dd MMMM yyyy')}

To,
${f.receiverName},
_________________________ (Address)

Sir/Madam,

On the instructions of my client ${f.senderName}, I hereby serve upon you this legal notice:

1. That my client had advanced to you a sum of Rs. ${f.amount}/- (Rupees ${f.amount} only) on ${f.loanDate}, which you agreed to repay on or before ${f.dueDate}.

2. That despite repeated requests and demands, you have failed and neglected to repay the said sum.

3. That the conduct of yours is illegal and amounts to Criminal Breach of Trust under Section 406 of IPC/BNS.

TAKE NOTICE that you are hereby called upon to pay the aforesaid sum of Rs. ${f.amount}/- along with interest @ 18% per annum from the date of default to my client within FIFTEEN (15) DAYS from the receipt of this notice.

Failing which, my client shall be constrained to initiate appropriate legal proceedings — both civil and criminal — against you without further notice, at your risk, cost and consequences.

Yours faithfully,
${adv.advocateName}
Advocate`
  },
  {
    id: 'maintenance',
    title: 'Maintenance Notice — S.125 CrPC/BNSS',
    icon: '👨‍👩‍👧',
    color: 'bg-green-50 border-green-200 text-green-700',
    fields: ['applicantName', 'respondentName', 'marriageDate', 'separationDate', 'maintenanceAmount', 'noticeDate'],
    generate: (f: any, adv: any) => `NOTICE UNDER SECTION 144 BNSS / SECTION 125 CrPC

From:
${adv.advocateName}, Advocate
Bar No. ${adv.barNumber}
${adv.court}

Date: ${format(new Date(f.noticeDate + 'T00:00:00'), 'dd MMMM yyyy')}

To,
${f.respondentName}
_________________________ (Address)

Sir,

On the instructions of my client ${f.applicantName} (Wife/Child of the noticee), I hereby serve this notice:

1. That my client and you were married on ${f.marriageDate} and lived as husband and wife. Minor children were born from the said wedlock.

2. That since ${f.separationDate}, you have without sufficient cause refused/neglected to maintain my client and the minor children.

3. That my client is unable to maintain herself/the children and is entirely dependent for her/their maintenance.

4. That you are legally obliged to maintain your wife/children under Section 144 BNSS/Section 125 CrPC.

TAKE NOTICE that my client demands maintenance of Rs. ${f.maintenanceAmount}/- per month for herself and the minor children.

You are called upon to make arrangements for the same within FIFTEEN (15) DAYS, failing which proceedings under Section 144 BNSS/125 CrPC shall be initiated against you.

Yours faithfully,
${adv.advocateName}
Advocate`
  },
  {
    id: 'service',
    title: 'Service / Employment Notice',
    icon: '👔',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    fields: ['employeeName', 'employerName', 'designation', 'terminationDate', 'dues', 'noticeDate'],
    generate: (f: any, adv: any) => `LEGAL NOTICE — WRONGFUL TERMINATION & UNPAID DUES

From:
${adv.advocateName}, Advocate
${adv.court}

Date: ${format(new Date(f.noticeDate + 'T00:00:00'), 'dd MMMM yyyy')}

To,
${f.employerName}
_________________________ (Address)

Sir/Madam,

I represent ${f.employeeName}, who was working as ${f.designation} in your organisation.

1. That my client was working with your organisation and was wrongfully terminated on ${f.terminationDate} without following due procedure of law and without giving proper notice as required.

2. That outstanding dues of Rs. ${f.dues}/- including salary, arrears, gratuity, provident fund and other statutory dues remain unpaid.

3. Such termination is illegal, arbitrary and violates the principles of natural justice and the provisions of the Industrial Disputes Act / Shops & Establishments Act.

TAKE NOTICE that you are hereby called upon to:
(a) Reinstate my client with full back wages; OR pay full and final settlement dues
(b) Pay all outstanding dues of Rs. ${f.dues}/-
(c) Comply within FIFTEEN (15) DAYS

Failing which, proceedings before the Labour Court/Industrial Tribunal shall be initiated.

${adv.advocateName}, Advocate`
  },
  {
    id: 'property',
    title: 'Property / Trespass Notice',
    icon: '🏠',
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    fields: ['ownerName', 'trespasserName', 'propertyDesc', 'trespassDate', 'noticeDate'],
    generate: (f: any, adv: any) => `LEGAL NOTICE — CRIMINAL TRESPASS / POSSESSION

From:
${adv.advocateName}, Advocate
${adv.court}

Date: ${format(new Date(f.noticeDate + 'T00:00:00'), 'dd MMMM yyyy')}

To,
${f.trespasserName}
_________________________ (Address)

Sir/Madam,

Under instructions from my client ${f.ownerName}, I hereby serve this notice:

1. My client is the lawful owner/possessor of property described as: ${f.propertyDesc}

2. You have, without any right, title or authority, illegally encroached/trespassed upon the said property since ${f.trespassDate}.

3. Your act constitutes criminal trespass under Section 329 BNS (formerly Section 447 IPC) and civil wrong entitling my client to damages.

TAKE NOTICE that you are hereby called upon to:
(a) Immediately vacate the said property;
(b) Remove all your articles/constructions from the property;
(c) Pay damages for illegal occupation

All within FIFTEEN (15) DAYS of receipt of this notice.

Failing which, criminal complaint under Section 329 BNS and civil suit for recovery of possession and damages shall be filed without further notice.

${adv.advocateName}, Advocate`
  },
];

const FIELD_LABELS: Record<string, string> = {
  complainantName: 'Complainant Name',
  chequeNo: 'Cheque Number',
  chequeDate: 'Cheque Date',
  bankName: 'Bank Name',
  amount: 'Amount (₹)',
  noticeeeName: 'Noticee Name',
  noticeDate: 'Notice Date',
  senderName: 'Creditor/Sender Name',
  receiverName: 'Debtor/Receiver Name',
  loanDate: 'Date of Loan',
  dueDate: 'Repayment Due Date',
  applicantName: 'Applicant Name (Wife/Child)',
  respondentName: 'Respondent Name (Husband)',
  marriageDate: 'Marriage Date',
  separationDate: 'Date of Separation',
  maintenanceAmount: 'Maintenance Amount (₹/month)',
  employeeName: 'Employee Name',
  employerName: 'Employer/Company Name',
  designation: 'Designation',
  terminationDate: 'Termination Date',
  dues: 'Outstanding Dues (₹)',
  ownerName: 'Property Owner Name',
  trespasserName: 'Trespasser Name',
  propertyDesc: 'Property Description',
  trespassDate: 'Date of Trespass',
};

const isDateField = (f: string) =>
  ['chequeDate','noticeDate','loanDate','dueDate','marriageDate','separationDate','terminationDate','trespassDate'].includes(f);

export const LegalNotices = () => {
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const settings = getSettings();

  const template = TEMPLATES.find(t => t.id === selectedTemplate);

  const handleGenerate = () => {
    if (!template) return;
    const f = { ...fields, noticeDate: fields.noticeDate || format(new Date(), 'yyyy-MM-dd') };
    const text = template.generate(f, settings);
    setPreview(text);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: template?.title, text: preview });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(preview)}`, '_blank');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 shrink-0" style={{ background: 'linear-gradient(135deg, #0a0f1e, #1a0a35)' }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <Mail size={24} className="text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-purple-400">Ready Templates</p>
            <h2 className="text-2xl font-display font-bold text-white">Legal Notices</h2>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {/* Template Selection */}
        {!selectedTemplate ? (
          <>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Select Notice Type</p>
            <div className="space-y-3">
              {TEMPLATES.map(t => (
                <motion.button key={t.id} whileTap={{ scale: 0.98 }}
                  onClick={() => { setSelectedTemplate(t.id); setFields({}); setPreview(''); }}
                  className={cn('w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4', t.color)}>
                  <span className="text-3xl">{t.icon}</span>
                  <div>
                    <p className="font-bold text-sm">{t.title}</p>
                    <p className="text-xs opacity-70 mt-0.5">Tap to fill and generate</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setSelectedTemplate(null); setPreview(''); }}
              className="text-xs font-bold text-legal-green flex items-center gap-1">
              ← Back to templates
            </button>

            <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold">{template?.icon} {template?.title}</h3>

              {/* Advocate auto-filled info */}
              <div className="p-3 bg-zinc-50 rounded-xl text-xs text-zinc-500">
                Advocate: <strong>{settings.advocateName || 'Not set'}</strong> · Bar: <strong>{settings.barNumber || 'Not set'}</strong>
              </div>

              {template?.fields.map(f => (
                <div key={f} className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block">
                    {FIELD_LABELS[f] || f}
                  </label>
                  <input
                    type={isDateField(f) ? 'date' : 'text'}
                    placeholder={FIELD_LABELS[f] || f}
                    value={fields[f] || (f === 'noticeDate' ? format(new Date(), 'yyyy-MM-dd') : '')}
                    onChange={e => setFields({ ...fields, [f]: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:border-purple-400"
                  />
                </div>
              ))}

              <button onClick={handleGenerate}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-bold">
                Generate Notice
              </button>
            </div>

            {/* Preview */}
            {preview && (
              <div className="space-y-3">
                <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
                  <pre className="text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap font-mono">
                    {preview}
                  </pre>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleCopy}
                    className="flex items-center justify-center gap-2 py-3.5 bg-zinc-900 text-white rounded-2xl font-bold text-sm">
                    {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Text</>}
                  </button>
                  <button onClick={handleShare}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm"
                    style={{ background: '#25D366', color: 'white' }}>
                    <Share2 size={16} /> WhatsApp
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
