import { config } from 'dotenv';

config();

export default {
  port: parseInt(process.env.PORT || '3000'),
  smtpPort: parseInt(process.env.SMTP_PORT || '25'),
  allowedDomains: (process.env.ALLOWED_DOMAINS || 'mailhook.local').split(',').map(d => d.trim()),
  dbPath: process.env.DB_PATH || './data/mailhook.db',
};
