const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const pdfFolder = path.resolve(__dirname, '../../storage/pdfs');

if (!fs.existsSync(pdfFolder)) {
  fs.mkdirSync(pdfFolder, { recursive: true });
}

function formatDate(value, locale = 'en-US') {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function formatInvoiceDate(value, locale = 'en-US') {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function currency(value) {
  return Number(value || 0).toFixed(2);
}

function drawLabelValue(doc, x, y, label, value, options = {}) {
  const labelWidth = options.labelWidth || 95;
  const valueWidth = options.valueWidth || 140;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(label, x, y, {
    width: labelWidth
  });
  doc.font('Helvetica').fontSize(10).fillColor('#0f172a').text(value || '-', x + labelWidth, y, {
    width: valueWidth
  });
}

const generateInvoicePdf = (invoice) => {
  const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
  const filePath = path.join(pdfFolder, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    const payout = invoice.payoutDetails || {};
    const payeeLines = [
      invoice.contractorName,
      payout.payeeAddressLine1,
      payout.payeeAddressLine2,
      [payout.payeeCity, payout.payeeState, payout.payeePostalCode].filter(Boolean).join(', '),
      payout.payeeCountry,
      invoice.contractorEmail || payout.remittanceEmail
    ].filter(Boolean);

    let y = 48;
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text(payeeLines[0] || 'Contractor', 48, y);
    y += 22;

    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    for (const line of payeeLines.slice(1)) {
      doc.text(line, 48, y);
      y += 14;
    }

    doc.font('Helvetica-Bold').fontSize(24).fillColor('#0f172a').text('INVOICE', 400, 48, { align: 'right' });
    drawLabelValue(doc, 340, 92, 'DATE', formatInvoiceDate(new Date()));
    drawLabelValue(doc, 340, 110, 'INVOICE NO.', invoice.invoiceNumber);

    doc.moveTo(48, 160).lineTo(547, 160).strokeColor('#cbd5e1').lineWidth(1).stroke();

    drawLabelValue(
      doc,
      48,
      176,
      'BILL TO',
      process.env.INVOICE_BILL_TO_NAME || 'Myemployer',
      { labelWidth: 65, valueWidth: 170 }
    );
    drawLabelValue(
      doc,
      300,
      176,
      'PERIOD',
      `${formatDate(invoice.startDate)} To ${formatDate(invoice.endDate)}`,
      { labelWidth: 55, valueWidth: 190 }
    );

    const billToAddressLines = [
      process.env.INVOICE_BILL_TO_ADDRESS_LINE1,
      process.env.INVOICE_BILL_TO_ADDRESS_LINE2,
      [
        process.env.INVOICE_BILL_TO_CITY,
        process.env.INVOICE_BILL_TO_STATE,
        process.env.INVOICE_BILL_TO_POSTAL_CODE
      ]
        .filter(Boolean)
        .join(' '),
      process.env.INVOICE_BILL_TO_PHONE
    ].filter(Boolean);

    let billToY = 194;
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    for (const line of billToAddressLines) {
      doc.text(line, 48, billToY);
      billToY += 13;
    }

    drawLabelValue(doc, 48, 250, 'PROJECT', invoice.projectName || '-', {
      labelWidth: 60,
      valueWidth: 220
    });
    drawLabelValue(doc, 320, 250, 'ACCOUNT', invoice.projectAccountNumber || '-', {
      labelWidth: 60,
      valueWidth: 150
    });

    const projectMeta = [invoice.projectKey, invoice.projectNumber].filter(Boolean).join(' | ');
    if (projectMeta) {
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(projectMeta, 48, 268);
    }

    const tableTop = 305;
    const ticketX = 48;
    const hoursX = 475;
    doc.rect(48, tableTop, 499, 24).fill('#e2e8f0');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('TICKETS LIST', ticketX + 8, tableTop + 7);
    doc.text('HOURS', hoursX, tableTop + 7, { width: 50, align: 'right' });

    let rowY = tableTop + 30;
    const worklogs = Array.isArray(invoice.worklogs) ? invoice.worklogs : [];

    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    if (worklogs.length === 0) {
      doc.text('No project worklogs found.', ticketX + 8, rowY);
      rowY += 18;
    } else {
      for (const item of worklogs) {
        const title = [item.issueKey, item.issueSummary].filter(Boolean).join(' - ') || item.label || 'Worklog';
        const rowStartY = rowY;
        const titleHeight = doc.heightOfString(title, { width: 390 });
        doc.text(title, ticketX + 8, rowY, { width: 390 });
        rowY += Math.max(18, titleHeight + 2);
        doc.text(Number(item.quantity || 0).toFixed(2), hoursX, rowStartY, { width: 50, align: 'right' });
        doc.moveTo(48, rowY).lineTo(547, rowY).strokeColor('#e2e8f0').lineWidth(0.6).stroke();
        rowY += 8;
      }
    }

    const remarksTop = Math.max(rowY + 12, 610);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Remarks / Payment Instructions:', 48, remarksTop);

    const remarksLines = [
      payout.bankAccountTitle ? `Account holder: ${payout.bankAccountTitle}` : null,
      payout.bankRoutingNumber ? `ACH and Wire routing number: ${payout.bankRoutingNumber}` : null,
      payout.bankAccountNumber ? `Account number: ${payout.bankAccountNumber}` : null,
      payout.bankAccountType ? `Account type: ${payout.bankAccountType}` : null,
      payout.bankName ? `Bank name: ${payout.bankName}` : null,
      payout.bankAddressLine1,
      payout.bankAddressLine2,
      [payout.bankCity, payout.bankState, payout.bankPostalCode].filter(Boolean).join(' '),
      payout.bankCountry
    ].filter(Boolean);

    let remarksY = remarksTop + 18;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    for (const line of remarksLines) {
      doc.text(line, 48, remarksY, { width: 280 });
      remarksY += 12;
    }

    const totalsTop = remarksTop + 4;
    drawLabelValue(doc, 345, totalsTop, 'TOTAL HOURS', Number(invoice.totalHours || 0).toFixed(2), {
      labelWidth: 95,
      valueWidth: 90
    });
    drawLabelValue(doc, 345, totalsTop + 22, 'RATE / USD $', currency(invoice.rate), {
      labelWidth: 95,
      valueWidth: 90
    });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    drawLabelValue(doc, 345, totalsTop + 44, 'TOTAL / USD $', currency(invoice.amount), {
      labelWidth: 95,
      valueWidth: 90
    });

    doc.end();

    stream.on('finish', () => {
      resolve({ fileName, filePath });
    });
    stream.on('error', reject);
  });
};

module.exports = { generateInvoicePdf, pdfFolder };
