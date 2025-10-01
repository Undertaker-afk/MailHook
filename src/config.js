import { config } from 'dotenv';
import { customDomainsRepo } from './database/db.js';

config();

const appConfig = {
  port: parseInt(process.env.PORT || '3000'),
  smtpPort: parseInt(process.env.SMTP_PORT || '25'),
  defaultDomains: (process.env.ALLOWED_DOMAINS || 'mailhook.local').split(',').map(d => d.trim()),
  dbPath: process.env.DB_PATH || './data/mailhook.db',
};

// Get all allowed domains (default + verified custom domains)
export function getAllowedDomains() {
  try {
    const customDomains = customDomainsRepo.getAllVerifiedDomains();
    return [...appConfig.defaultDomains, ...customDomains];
  } catch (error) {
    // Database might not be initialized yet
    return appConfig.defaultDomains;
  }
}

export default appConfig;
