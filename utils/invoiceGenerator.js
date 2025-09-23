const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generates an invoice PDF for a booking
 * @param {Object} booking - The booking object
 * @param {Object} property - The property object
 * @param {Object} client - The client object
 * @param {Object} realtor - The realtor object
 * @returns {String} - Path to the generated invoice
 */
const generateInvoice = async (booking, property, client, realtor) => {
  return new Promise((resolve, reject) => {
    try {
      // Create a document
      const doc = new PDFDocument({ margin: 50 });
      
      // Create directory if it doesn't exist
      const invoiceDir = path.join(__dirname, '..', 'uploads', 'invoices');
      if (!fs.existsSync(invoiceDir)) {
        fs.mkdirSync(invoiceDir, { recursive: true });
      }
      
      // Set up the invoice file path
      const invoiceFileName = `invoice-${booking._id}.pdf`;
      const invoicePath = path.join(invoiceDir, invoiceFileName);
      
      // Pipe the PDF to a file
      const stream = fs.createWriteStream(invoicePath);
      doc.pipe(stream);
      
      // Add company letterhead
      doc.fontSize(20).text('PropStream Booking Invoice', { align: 'center' });
      doc.moveDown();
      
      // Add invoice details
      doc.fontSize(12).text(`Invoice #: ${booking._id.toString().slice(-8).toUpperCase()}`, { align: 'right' });
      doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown();
      
      // Add realtor details
      doc.fontSize(14).text('Realtor Details:', { underline: true });
      doc.fontSize(10);
      doc.text(`Name: ${realtor.name}`);
      doc.text(`Email: ${realtor.email}`);
      doc.text(`Phone: ${realtor.phone || 'N/A'}`);
      doc.moveDown();
      
      // Add client details
      doc.fontSize(14).text('Client Details:', { underline: true });
      doc.fontSize(10);
      doc.text(`Name: ${client.name}`);
      doc.text(`Email: ${client.email}`);
      doc.text(`Phone: ${client.phone || 'N/A'}`);
      doc.moveDown();
      
      // Add booking details
      doc.fontSize(14).text('Booking Details:', { underline: true });
      doc.fontSize(10);
      doc.text(`Property: ${property.name}`);
      doc.text(`Address: ${property.address}, ${property.city}, ${property.province}`);
      doc.text(`Check-in: ${new Date(booking.check_in).toLocaleDateString()}`);
      doc.text(`Check-out: ${new Date(booking.check_out).toLocaleDateString()}`);
      doc.text(`Number of Nights: ${Math.ceil((new Date(booking.check_out) - new Date(booking.check_in)) / (1000 * 60 * 60 * 24))}`);
      doc.text(`Number of Guests: ${booking.guests}`);
      doc.moveDown();
      
      // Add payment details
      doc.fontSize(14).text('Payment Details:', { underline: true });
      doc.fontSize(10);
      
      // Calculate subtotal and taxes
      const subtotal = booking.total_amount / 1.15; // Assuming 15% VAT
      const vat = booking.total_amount - subtotal;
      
      // Create a table for the bill
      const tableTop = doc.y + 10;
      const itemX = 50;
      const descriptionX = 150;
      const amountX = 400;
      
      doc.font('Helvetica-Bold');
      doc.text('Item', itemX, tableTop);
      doc.text('Description', descriptionX, tableTop);
      doc.text('Amount', amountX, tableTop);
      doc.moveDown();
      
      doc.font('Helvetica');
      let yPos = doc.y;
      
      // Add accommodation row
      doc.text('Accommodation', itemX, yPos);
      doc.text(`${property.name} - ${Math.ceil((new Date(booking.check_out) - new Date(booking.check_in)) / (1000 * 60 * 60 * 24))} nights`, descriptionX, yPos);
      doc.text(`R ${subtotal.toFixed(2)}`, amountX, yPos);
      doc.moveDown();
      
      // Add VAT row
      yPos = doc.y;
      doc.text('VAT (15%)', itemX, yPos);
      doc.text('', descriptionX, yPos);
      doc.text(`R ${vat.toFixed(2)}`, amountX, yPos);
      doc.moveDown();
      
      // Add total row
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      yPos = doc.y + 10;
      doc.font('Helvetica-Bold');
      doc.text('Total', itemX, yPos);
      doc.text('', descriptionX, yPos);
      doc.text(`R ${booking.total_amount.toFixed(2)}`, amountX, yPos);
      doc.moveDown();
      
      // Add payment terms
      doc.moveDown();
      doc.font('Helvetica');
      doc.text('Payment Terms: Due upon confirmation of booking', { align: 'left' });
      doc.moveDown();
      
      // Add special requests if any
      if (booking.special_requests) {
        doc.moveDown();
        doc.fontSize(14).text('Special Requests:', { underline: true });
        doc.fontSize(10).text(booking.special_requests);
        doc.moveDown();
      }
      
      // Add footer
      doc.fontSize(10).text('Thank you for choosing PropStream for your property management needs!', { align: 'center' });
      
      // Finalize the PDF
      doc.end();
      
      // When the stream is finished, resolve with the path
      stream.on('finish', () => {
        resolve({
          path: invoicePath,
          filename: invoiceFileName
        });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
      
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateInvoice };
