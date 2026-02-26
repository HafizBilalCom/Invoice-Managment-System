const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const pdfFolder = path.resolve(__dirname, '../../storage/pdfs');

if (!fs.existsSync(pdfFolder)) {
  fs.mkdirSync(pdfFolder, { recursive: true });
}

const generateInvoicePdf = (invoice) => {
  const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
  const filePath = path.join(pdfFolder, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    doc.fontSize(20).text('Contractor Invoice', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Invoice #: ${invoice.invoiceNumber}`);
    doc.text(`Contractor: ${invoice.contractorName}`);
    doc.text(`Period: ${invoice.startDate} to ${invoice.endDate}`);
    doc.text(`Project: ${invoice.projectName}`);
    doc.moveDown();

    doc.text('Hours and Amount', { underline: true });
    doc.text(`Total Hours: ${invoice.totalHours}`);
    doc.text(`Rate: ${invoice.rate}`);
    doc.text(`Amount: ${invoice.amount}`);
    doc.moveDown();

    doc.text(`Status: ${invoice.status}`);
    doc.text(`Generated At: ${new Date().toISOString()}`);

    doc.end();

    stream.on('finish', () => {
      resolve({ fileName, filePath });
    });
    stream.on('error', reject);
  });
};

module.exports = { generateInvoicePdf, pdfFolder };
