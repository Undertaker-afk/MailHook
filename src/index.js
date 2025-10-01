import { initDatabase } from './database/db.js';
import { createSMTPServer } from './smtp/server.js';
import { createWebServer } from './web/server.js';
import appConfig from './config.js';

async function start() {
  console.log('🚀 Starting MailHook...\n');

  // Initialize database
  await initDatabase();

  // Start SMTP server
  const smtpServer = createSMTPServer();
  smtpServer.listen(appConfig.smtpPort, () => {
    console.log(`📧 SMTP Server listening on port ${appConfig.smtpPort}`);
    console.log(`   Accepting mail for domains: ${appConfig.allowedDomains.join(', ')}\n`);
  });

  smtpServer.on('error', (err) => {
    console.error('SMTP Server error:', err);
  });

  // Start web server
  const webServer = createWebServer();
  
  try {
    await webServer.listen({ 
      port: appConfig.port, 
      host: '0.0.0.0' 
    });
    
    console.log(`🌐 Web Interface: http://localhost:${appConfig.port}`);
    console.log(`\n✅ MailHook is ready!\n`);
    console.log('📖 Configuration:');
    console.log(`   - Allowed domains: ${appConfig.allowedDomains.join(', ')}`);
    console.log(`   - Database: ${appConfig.dbPath}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Open http://localhost:${appConfig.port} in your browser`);
    console.log(`   2. Create an email hook with your webhook URL`);
    console.log(`   3. Configure your MX record to point to this server`);
    console.log(`   4. Send an email to the generated address\n`);
  } catch (err) {
    console.error('Failed to start web server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

start().catch((error) => {
  console.error('Failed to start MailHook:', error);
  process.exit(1);
});
