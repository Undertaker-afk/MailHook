import { ofetch } from 'ofetch';
import crypto from 'crypto';

export async function triggerWebhook({ webhookUrl, webhookSecret, emailData }) {
  const body = JSON.stringify(emailData);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'MailHook/1.0'
  };

  // Add signature if secret is provided
  if (webhookSecret) {
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    headers['X-MailHook-Signature'] = signature;
  }

  const response = await ofetch(webhookUrl, {
    method: 'POST',
    headers,
    body,
    timeout: 10000, // 10 seconds
  });

  return response;
}

export function verifyWebhookSignature(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
