const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: process.env.MAILTRAP_PORT || 2525,
    auth: {
      user: process.env.MAILTRAP_USER || "",
      pass: process.env.MAILTRAP_PASS || "",
    },
  });

  return transporter;
}

function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();
  return transporter.sendMail({
    from: process.env.MAIL_FROM || "",
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendMail,
};
