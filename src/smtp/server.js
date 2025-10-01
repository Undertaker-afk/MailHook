import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { emailHooksRepo, emailLogsRepo } from '../database/db.js';
import { triggerWebhook } from '../webhook/webhook.js';
import { nanoid } from 'nanoid';
import appConfig from '../config.js';

export function createSMTPServer() {
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH'],
    
    onData(stream, session, callback) {
      handleIncomingEmail(stream, session)
        .then(() => callback())
        .catch((err) => {
          console.error('Error handling email:', err);
          callback(new Error('Failed to process email'));
        });
    },

    onMailFrom(address, session, callback) {
      // Accept all senders
      return callback();
    },

    onRcptTo(address, session, callback) {
      const recipientEmail = address.address.toLowerCase();
      const domain = recipientEmail.split('@')[1];

      // Check if domain is allowed
      if (!appConfig.allowedDomains.includes(domain)) {
        return callback(new Error(`Domain ${domain} not allowed`));
      }

      return callback();
    }
  });

  return server;
}

async function handleIncomingEmail(stream, session) {
  try {
    // Parse the email
    const parsed = await simpleParser(stream);
    
    // Get recipient info
    const recipients = session.envelope.rcptTo.map(r => r.address.toLowerCase());
    
    console.log(`📧 Received email from ${session.envelope.mailFrom.address} to ${recipients.join(', ')}`);

    // Process each recipient
    for (const recipientEmail of recipients) {
      await processEmailForRecipient(parsed, session.envelope.mailFrom.address, recipientEmail);
    }
  } catch (error) {
    console.error('Error in handleIncomingEmail:', error);
    throw error;
  }
}

async function processEmailForRecipient(parsed, fromAddress, toAddress) {
  // Find the email hook
  const hook = emailHooksRepo.findByEmail(toAddress);
  
  if (!hook) {
    console.log(`⚠️  No hook found for ${toAddress}`);
    
    // Still log it
    emailLogsRepo.create({
      id: nanoid(),
      hookId: 'unknown',
      fromAddress,
      subject: parsed.subject,
      status: 'not_found',
      error: `No hook configured for ${toAddress}`
    });
    
    return;
  }

  // Check if hook is enabled
  if (!hook.isEnabled) {
    console.log(`⚠️  Hook disabled for ${toAddress}`);
    
    emailLogsRepo.create({
      id: nanoid(),
      hookId: hook.id,
      fromAddress,
      subject: parsed.subject,
      status: 'disabled',
      error: 'Hook is disabled'
    });
    
    return;
  }

  // Prepare email data for webhook
  const emailData = {
    from: {
      address: parsed.from?.value?.[0]?.address || fromAddress,
      name: parsed.from?.value?.[0]?.name || ''
    },
    to: toAddress,
    subject: parsed.subject || '',
    text: parsed.text || '',
    html: parsed.html || '',
    headers: parsed.headers ? Object.fromEntries(parsed.headers) : {},
    attachments: (parsed.attachments || []).map(att => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size
      // Note: We're not sending the actual content to save bandwidth
      // You can add content: att.content.toString('base64') if needed
    }))
  };

  // Trigger webhook
  try {
    const response = await triggerWebhook({
      webhookUrl: hook.webhookUrl,
      webhookSecret: hook.webhookSecret,
      emailData
    });

    console.log(`✅ Webhook triggered successfully for ${toAddress} (${response.status})`);

    // Log success
    emailLogsRepo.create({
      id: nanoid(),
      hookId: hook.id,
      fromAddress,
      subject: parsed.subject,
      status: 'success',
      webhookStatusCode: response.status
    });

  } catch (error) {
    console.error(`❌ Webhook failed for ${toAddress}:`, error.message);

    // Log failure
    emailLogsRepo.create({
      id: nanoid(),
      hookId: hook.id,
      fromAddress,
      subject: parsed.subject,
      status: 'error',
      error: error.message,
      webhookStatusCode: error.response?.status
    });
  }
}
