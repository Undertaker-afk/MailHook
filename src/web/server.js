import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { emailHooksRepo, emailLogsRepo, customDomainsRepo } from '../database/db.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import appConfig, { getAllowedDomains } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createWebServer() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  });

  // Serve static files
  fastify.register(fastifyStatic, {
    root: join(__dirname, 'public'),
    prefix: '/'
  });

  // API Routes

  // Get configuration (available domains)
  fastify.get('/api/config', async (request, reply) => {
    return {
      defaultDomains: appConfig.defaultDomains,
      allowedDomains: getAllowedDomains(),
      customDomains: customDomainsRepo.findAll()
    };
  });

  // Custom Domains Routes
  
  // List custom domains
  fastify.get('/api/domains', async (request, reply) => {
    const userId = request.query.userId || 'default';
    return customDomainsRepo.findAll(userId);
  });

  // Add custom domain
  fastify.post('/api/domains', async (request, reply) => {
    const { domain } = request.body;
    const userId = request.body.userId || 'default';

    if (!domain) {
      return reply.code(400).send({ error: 'Domain is required' });
    }

    // Basic domain validation
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return reply.code(400).send({ error: 'Invalid domain format' });
    }

    // Check if domain already exists
    if (customDomainsRepo.findByDomain(domain)) {
      return reply.code(409).send({ error: 'Domain already exists' });
    }

    // Generate verification token and MX record
    const verificationToken = nanoid(32);
    const mxRecord = `mailhook-verify=${verificationToken}`;

    const customDomain = customDomainsRepo.create({
      id: nanoid(),
      domain,
      userId,
      verificationToken,
      mxRecord: `10 ${appConfig.defaultDomains[0]}`
    });

    return reply.code(201).send(customDomain);
  });

  // Verify custom domain
  fastify.post('/api/domains/:id/verify', async (request, reply) => {
    const domain = customDomainsRepo.findById(request.params.id);
    
    if (!domain) {
      return reply.code(404).send({ error: 'Domain not found' });
    }

    if (domain.isVerified) {
      return reply.send({ ...domain, message: 'Domain already verified' });
    }

    // In a real implementation, you would check DNS records here
    // For now, we'll simulate verification
    try {
      // Check if TXT record exists with verification token
      // const dns = require('dns').promises;
      // const records = await dns.resolveTxt(domain.domain);
      // const hasVerificationRecord = records.some(record => 
      //   record.some(txt => txt.includes(domain.verificationToken))
      // );

      // For demo purposes, auto-verify
      const verified = customDomainsRepo.verify(request.params.id);
      
      return reply.send({
        ...verified,
        message: 'Domain verified successfully'
      });
    } catch (error) {
      return reply.code(500).send({ 
        error: 'Failed to verify domain',
        details: error.message 
      });
    }
  });

  // Delete custom domain
  fastify.delete('/api/domains/:id', async (request, reply) => {
    const deleted = customDomainsRepo.delete(request.params.id);
    
    if (!deleted) {
      return reply.code(404).send({ error: 'Domain not found' });
    }

    return { success: true };
  });

  // List all email hooks
  fastify.get('/api/hooks', async (request, reply) => {
    const userId = request.query.userId || 'default';
    const hooks = emailHooksRepo.findAll(userId);
    
    // Hide webhook secrets in list view
    return hooks.map(hook => ({
      ...hook,
      webhookSecret: hook.webhookSecret ? '••••••••' : null
    }));
  });

  // Get single hook
  fastify.get('/api/hooks/:id', async (request, reply) => {
    const hook = emailHooksRepo.findById(request.params.id);
    
    if (!hook) {
      return reply.code(404).send({ error: 'Hook not found' });
    }

    // Hide webhook secret
    return {
      ...hook,
      webhookSecret: hook.webhookSecret ? '••••••••' : null
    };
  });

  // Create new email hook
  fastify.post('/api/hooks', async (request, reply) => {
    const { username, domain, webhookUrl, webhookSecret, userId } = request.body;

    // Validation
    if (!username || !domain || !webhookUrl) {
      return reply.code(400).send({ 
        error: 'Missing required fields: username, domain, webhookUrl' 
      });
    }

    const allowedDomains = getAllowedDomains();
    if (!allowedDomains.includes(domain)) {
      return reply.code(400).send({ 
        error: `Domain ${domain} is not allowed. Allowed domains: ${allowedDomains.join(', ')}` 
      });
    }

    // Username validation
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(username)) {
      return reply.code(400).send({ 
        error: 'Invalid username. Must start and end with alphanumeric characters and can contain dots, hyphens, and underscores.' 
      });
    }

    // URL validation
    try {
      new URL(webhookUrl);
    } catch {
      return reply.code(400).send({ error: 'Invalid webhook URL' });
    }

    const email = `${username}@${domain}`;

    // Check if email already exists
    if (emailHooksRepo.findByEmail(email)) {
      return reply.code(409).send({ 
        error: `Email ${email} is already registered` 
      });
    }

    // Create hook
    const hook = emailHooksRepo.create({
      id: nanoid(),
      email,
      username,
      domain,
      userId: userId || 'default',
      webhookUrl,
      webhookSecret: webhookSecret || null,
      isEnabled: true
    });

    return reply.code(201).send(hook);
  });

  // Update email hook
  fastify.patch('/api/hooks/:id', async (request, reply) => {
    const hook = emailHooksRepo.findById(request.params.id);
    
    if (!hook) {
      return reply.code(404).send({ error: 'Hook not found' });
    }

    const { webhookUrl, webhookSecret, isEnabled } = request.body;
    
    const updates = {};
    
    if (webhookUrl !== undefined) {
      try {
        new URL(webhookUrl);
        updates.webhookUrl = webhookUrl;
      } catch {
        return reply.code(400).send({ error: 'Invalid webhook URL' });
      }
    }
    
    if (webhookSecret !== undefined) {
      updates.webhookSecret = webhookSecret || null;
    }
    
    if (isEnabled !== undefined) {
      updates.isEnabled = Boolean(isEnabled);
    }

    const updatedHook = emailHooksRepo.update(request.params.id, updates);
    
    return {
      ...updatedHook,
      webhookSecret: updatedHook.webhookSecret ? '••••••••' : null
    };
  });

  // Delete email hook
  fastify.delete('/api/hooks/:id', async (request, reply) => {
    const deleted = emailHooksRepo.delete(request.params.id);
    
    if (!deleted) {
      return reply.code(404).send({ error: 'Hook not found' });
    }

    return { success: true };
  });

  // Get logs for a specific hook
  fastify.get('/api/hooks/:id/logs', async (request, reply) => {
    const hook = emailHooksRepo.findById(request.params.id);
    
    if (!hook) {
      return reply.code(404).send({ error: 'Hook not found' });
    }

    const logs = emailLogsRepo.findByHookId(request.params.id, 100);
    return logs;
  });

  // Get recent logs (all hooks)
  fastify.get('/api/logs', async (request, reply) => {
    const logs = emailLogsRepo.findRecent(100);
    return logs;
  });

  return fastify;
}
