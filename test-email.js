#!/usr/bin/env node

/**
 * Test script to send a test email to the SMTP server
 * Usage: node test-email.js
 */

import nodemailer from 'nodemailer';

const config = {
  host: 'localhost',
  port: 2525,
  secure: false,
  tls: {
    rejectUnauthorized: false
  }
};

const mailOptions = {
  from: 'sender@example.com',
  to: 'test@mailhook.local',
  subject: 'Test E-Mail von MailHook',
  text: 'Dies ist eine Test-E-Mail.',
  html: '<h1>Test E-Mail</h1><p>Dies ist eine <strong>Test-E-Mail</strong> von MailHook.</p>'
};

async function sendTestEmail() {
  console.log('📧 Sende Test-E-Mail...\n');
  console.log('Von:', mailOptions.from);
  console.log('An:', mailOptions.to);
  console.log('Betreff:', mailOptions.subject);
  console.log('');

  try {
    const transporter = nodemailer.createTransport(config);
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ E-Mail erfolgreich gesendet!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Fehler beim Senden:', error.message);
    process.exit(1);
  }
}

sendTestEmail();
