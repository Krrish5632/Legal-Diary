import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CauseListModel, HistoryModel } from '../core/pdfmodel';

export interface PdfFile {
  name: string;
  bytes: Uint8Array;
  blob: Blob;
  warning: string;
}

const NAVY: [number, number, number] = [11, 31, 58];
const GOLD: [number, number, number] = [201, 162, 39];
const PALE: [number, number, number] = [240, 243, 248];

function endY(doc: jsPDF, fallback: number): number {
  const t = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof t?.finalY === 'number' ? t.finalY : fallback;
}

function pageSize(doc: jsPDF): { w: number; h: number } {
  return { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() };
}

function topHeader(doc: jsPDF, title: string, line2: string, line3: string): number {
  const { w } = pageSize(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(title, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(line2, 14, 22);
  if (line3) {
    doc.setFontSize(9);
    doc.text(line3, 14, 27);
  }
  doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.setLineWidth(0.6);
  doc.line(14, 30, w - 14, 30);
  return 36;
}

function sectionHeading(doc: jsPDF, text: string, y: number): number {
  const { h } = pageSize(doc);
  let yy = y;
  if (yy > h - 35) {
    doc.addPage();
    yy = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(text, 14, yy);
  return yy + 3;
}

function paragraph(doc: jsPDF, text: string, y: number, italic: boolean): number {
  const { w, h } = pageSize(doc);
  doc.setFont('helvetica', italic ? 'italic' : 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const lines = doc.splitTextToSize(text, w - 28) as string[];
  let yy = y;
  for (const line of lines) {
    if (yy > h - 18) {
      doc.addPage();
      yy = 16;
    }
    doc.text(line, 14, yy);
    yy += 4.5;
  }
  return yy + 3;
}

function footers(doc: jsPDF, left: string): void {
  const n = doc.getNumberOfPages();
  const { w, h } = pageSize(doc);
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(left, 14, h - 8);
    doc.text('Page ' + i + ' of ' + n, w - 14, h - 8, { align: 'right' });
  }
}

function finish(doc: jsPDF, name: string, lost: number, footerLeft: string): PdfFile {
  footers(doc, footerLeft);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const blob = doc.output('blob');
  const warning =
    lost > 0
      ? lost + ' character(s), for example Hindi letters, cannot be shown in this PDF and appear as "?".'
      : '';
  return { name, bytes, blob, warning };
}

const TABLE_STYLES = { font: 'helvetica', fontSize: 9, cellPadding: 1.8, overflow: 'linebreak' as const, valign: 'top' as const };

export function renderCauseListPdf(m: CauseListModel): PdfFile {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { h } = pageSize(doc);
  const summary = m.total + ' case(s) listed' + (m.highCount ? ', ' + m.highCount + ' high priority' : '');
  let y = topHeader(doc, m.heading, m.period, summary);
  if (m.days.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text('No hearings are listed for this period.', 14, y);
  }
  for (const day of m.days) {
    if (y > h - 40) {
      doc.addPage();
      y = 16;
    }
    const startY = sectionHeading(doc, day.label + '  (' + day.rows.length + ')', y);
    autoTable(doc, {
      startY,
      head: [['Sr', 'Case No.', 'Parties', 'Court', 'Stage', 'Status']],
      body: day.rows.map((r) => [
        String(r.no),
        r.caseNo + (r.high ? '\nHIGH PRIORITY' : ''),
        r.title,
        r.court,
        r.stage,
        r.status,
      ]),
      theme: 'grid',
      styles: TABLE_STYLES,
      headStyles: { fillColor: NAVY, textColor: 255 },
      margin: { left: 14, right: 14, bottom: 16 },
      rowPageBreak: 'avoid',
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 30 },
        2: { cellWidth: 62 },
        3: { cellWidth: 32 },
        4: { cellWidth: 28 },
        5: { cellWidth: 20 },
      },
    });
    y = endY(doc, startY + 10) + 8;
  }
  return finish(doc, m.fileName, m.unsupportedChars, 'Legal Diary Pro | Generated ' + m.generated);
}

export function renderHistoryPdf(m: HistoryModel): PdfFile {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = topHeader(doc, m.heading, m.caseNo + (m.title ? ' - ' + m.title : ''), '');

  let startY = sectionHeading(doc, 'Case details', y);
  autoTable(doc, {
    startY,
    body: m.info,
    theme: 'grid',
    styles: TABLE_STYLES,
    margin: { left: 14, right: 14, bottom: 16 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold', fillColor: PALE },
      1: { cellWidth: 132 },
    },
  });
  y = endY(doc, startY + 10) + 8;

  if (m.notes) {
    startY = sectionHeading(doc, 'Notes', y);
    y = paragraph(doc, m.notes, startY + 2, false) + 2;
  }

  startY = sectionHeading(doc, 'Hearing history', y);
  if (m.hearings.length === 0) {
    y = paragraph(doc, 'No hearings are recorded for this case.', startY + 2, false);
  } else {
    autoTable(doc, {
      startY,
      head: [['Date', 'Status', 'Proceedings', 'Court order', 'Notes', 'Next date']],
      body: m.hearings.map((r) => [r.date, r.status, r.proceedings, r.order, r.notes, r.next]),
      theme: 'grid',
      styles: TABLE_STYLES,
      headStyles: { fillColor: NAVY, textColor: 255 },
      margin: { left: 14, right: 14, bottom: 16 },
      rowPageBreak: 'avoid',
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 22 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40 },
        4: { cellWidth: 36 },
        5: { cellWidth: 20 },
      },
    });
    y = endY(doc, startY + 10) + 6;
  }
  if (m.footnote) y = paragraph(doc, m.footnote, y + 1, true);

  if (m.log.length > 0) {
    startY = sectionHeading(doc, 'Change log', y + 2);
    autoTable(doc, {
      startY,
      head: [['When', 'What', 'Detail']],
      body: m.log.map((r) => [r.when, r.what, r.detail]),
      theme: 'grid',
      styles: { ...TABLE_STYLES, fontSize: 8 },
      headStyles: { fillColor: NAVY, textColor: 255 },
      margin: { left: 14, right: 14, bottom: 16 },
      rowPageBreak: 'avoid',
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 30 },
        2: { cellWidth: 120 },
      },
    });
  }
  return finish(doc, m.fileName, m.unsupportedChars, 'Legal Diary Pro | Case history | Generated ' + m.generated);
}
// end of pdf.ts
