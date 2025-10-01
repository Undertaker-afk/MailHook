import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { emailHooksRepo, emailLogsRepo } from '../database/db.js';
import { nanoid } from 'nanoid';
import appConfig from '../config.js';

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
      allowedDomains: appConfig.allowedDomains
    };
  });

  // List all email hooks
  fastify.get('/api/hooks', async (request, reply) => {
    const hooks = emailHooksRepo.findAll();
    
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
    const { username, domain, webhookUrl, webhookSecret } = request.body;

    // Validation
    if (!username || !domain || !webhookUrl) {
      return reply.code(400).send({ 
        error: 'Missing required fields: username, domain, webhookUrl' 
      });
    }

    if (!appConfig.allowedDomains.includes(domain)) {
      return reply.code(400).send({ 
        error: `Domain ${domain} is not allowed. Allowed domains: ${appConfig.allowedDomains.join(', ')}` 
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
