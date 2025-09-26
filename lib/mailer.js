const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

exports.send = async ({ to, subject, text, html }) => {
  if (!process.env.SMTP_USER) {
    console.log(`Mailer stub: send to=${to} subject=${subject} text=${text}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `no-reply@${(process.env.APP_PUBLIC_URL||'example.com').replace(/^https?:\/\//,'')}`,
    to,
    subject,
    text,
    html
  });
};
