import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { LegalCase } from '../types';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const buildDoc = (
  title: string,
  cases: LegalCase[],
  advocateName: string,
  subtitle?: string
) => {
  const doc = new jsPDF() as any;

  doc.setFillColor(10, 15, 30);
  doc.rect(0, 0, 210, 46, 'F');

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(212, 175, 55);
  doc.text(title, 105, 16, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  if (subtitle) doc.text(subtitle, 105, 24, { align: 'center' });
  doc.text(`Advocate: ${advocateName}`, 15, subtitle ? 32 : 26);
  doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, subtitle ? 38 : 32);
  doc.text(`Cases: ${cases.length}`, 170, subtitle ? 32 : 26);

  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.7);
  doc.line(12, 42, 198, 42);

  const rows = cases.map((c, i) => [
    i + 1,
    c.caseNumber || '-',
    `${c.parties.plaintiff}\nvs\n${c.parties.defendant}`,
    c.court.name || '-',
    c.nextDate ? format(new Date(c.nextDate + 'T00:00:00'), 'dd/MM/yy') : '-',
    c.currentProceeding || '-',
    c.status || '-',
  ]);

  doc.autoTable({
    startY: 46,
    head: [['Sr', 'Case No.', 'Parties', 'Court', 'Date', 'Stage', 'Status']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: [26, 77, 46],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [248, 250, 248] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 52 },
      3: { cellWidth: 34 },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 26 },
      6: { cellWidth: 20, halign: 'center' },
    },
    margin: { left: 12, right: 12 },
    didDrawPage: (data: any) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `${advocateName}  |  Page ${data.pageNumber} of ${pageCount}  |  Legal Diary Pro`,
        105, 290, { align: 'center' }
      );
    },
  });

  return doc;
};

// Saves PDF to device — works in Capacitor Android
const savePDF = async (doc: any, filename: string): Promise<void> => {
  const base64Data: string = doc.output('datauristring').split(',')[1];

  // Method 1: Capacitor Filesystem (best for Android)
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const path = `LegalDiary/${filename}`;

    await Filesystem.writeFile({
      path,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });

    const result = await Filesystem.getUri({ path, directory: Directory.Documents });
    alert(`✓ PDF Saved!\n\nLocation: Documents/LegalDiary/${filename}\n\nFiles app mein jakar open karein.`);
    return;
  } catch (fsError) {
    // Filesystem failed, try next method
  }

  // Method 2: External Storage (Downloads folder)
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
    alert(`✓ PDF Saved!\n\nFile: ${filename}\n\nDownloads folder mein dekhen.`);
    return;
  } catch {
    // Try next
  }

  // Method 3: Web Share API with file
  try {
    const blob = new Blob(
      [Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))],
      { type: 'application/pdf' }
    );
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: filename.replace('.pdf', ''),
        files: [file],
      });
      return;
    }
  } catch {
    // Try next
  }

  // Method 4: Blob URL download (browser fallback)
  try {
    const blob = new Blob(
      [Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))],
      { type: 'application/pdf' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    return;
  } catch {
    // Last resort
  }

  // Method 5: Open in new window/tab
  const dataUri = `data:application/pdf;base64,${base64Data}`;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`
      <html><head><title>${filename}</title></head>
      <body style="margin:0;padding:0">
        <iframe src="${dataUri}" style="width:100%;height:100vh;border:none"></iframe>
      </body></html>
    `);
    win.document.close();
  } else {
    // Absolute last resort
    window.location.href = dataUri;
  }
};

export const pdfGenerator = {
  generateCauseList: async (date: string, cases: LegalCase[], advocateName: string) => {
    if (!cases.length) {
      alert('Koi case nahi hai is date par.');
      return;
    }
    const subtitle = `Hearing Date: ${format(new Date(date + 'T00:00:00'), 'dd MMMM yyyy')}`;
    const doc = buildDoc('DAILY CAUSE LIST', cases, advocateName, subtitle);
    await savePDF(doc, `cause_list_${date}.pdf`);
  },

  generateMonthlyCauseList: async (month: Date, cases: LegalCase[], advocateName: string) => {
    if (!cases.length) {
      alert('Is mahine koi case scheduled nahi hai.');
      return;
    }
    const subtitle = `Month: ${format(month, 'MMMM yyyy')}`;
    const doc = buildDoc('MONTHLY CAUSE LIST', cases, advocateName, subtitle);
    await savePDF(doc, `cause_list_${format(month, 'yyyy-MM')}.pdf`);
  },

  printCauseList: (date: string, cases: LegalCase[], advocateName: string) => {
    if (!cases.length) return;
    const subtitle = `Hearing Date: ${format(new Date(date + 'T00:00:00'), 'dd MMMM yyyy')}`;
    const doc = buildDoc('CAUSE LIST', cases, advocateName, subtitle) as any;
    const dataUri = doc.output('datauristring');
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head>
        <title>Print - ${date}</title>
        <style>*{margin:0;padding:0}body{background:#fff}iframe{width:100%;height:100vh;border:none}</style>
      </head><body>
        <iframe src="${dataUri}" onload="setTimeout(()=>{window.print();},800)"></iframe>
      </body></html>`);
      win.document.close();
    }
  },
};
