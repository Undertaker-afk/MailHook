# 📧 MailHook

Ein einfacher E-Mail-zu-Webhook Service mit Weboberfläche. Empfangen Sie E-Mails über SMTP und leiten Sie diese automatisch an Ihre Webhooks weiter.

## Features

- ✅ **SMTP Server** - Empfängt E-Mails über Standard-SMTP-Protokoll
- 🌐 **Web Interface** - Einfache Weboberfläche zur Verwaltung der Hooks
- 🔐 **Webhook Signatures** - HMAC-SHA256 Signierung für sichere Webhooks
- 📊 **Logging** - Vollständige Protokollierung aller E-Mail-Verarbeitungen
- 🎯 **Multi-Domain** - Unterstützung mehrerer E-Mail-Domains
- 💾 **SQLite Datenbank** - Leichtgewichtige lokale Datenspeicherung

## Installation

### Voraussetzungen

- Node.js 18+ oder höher
- npm oder pnpm

### Setup

1. Repository klonen oder Dateien kopieren

2. Dependencies installieren:
```bash
npm install
```

3. Umgebungsvariablen konfigurieren:
```bash
cp .env.example .env
```

Bearbeiten Sie `.env`:
```env
PORT=3000                                    # Web Interface Port
SMTP_PORT=25                                 # SMTP Server Port (benötigt Root für Port 25)
ALLOWED_DOMAINS=mailhook.local,callback.local
DB_PATH=./data/mailhook.db
```

4. Starten:
```bash
npm start
```

Für Development mit Auto-Reload:
```bash
npm run dev
```

## Verwendung

### 1. Web Interface öffnen

Öffnen Sie `http://localhost:3000` in Ihrem Browser.

### 2. E-Mail Hook erstellen

- Wählen Sie einen Benutzernamen (z.B. `test-webhook`)
- Wählen Sie eine Domain aus der Liste
- Geben Sie Ihre Webhook-URL ein (z.B. `https://ihre-domain.de/webhook`)
- Optional: Fügen Sie ein Webhook-Secret hinzu für signierte Requests

### 3. MX Record konfigurieren

Konfigurieren Sie Ihren DNS MX Record für die gewählte Domain:

```
mailhook.local.    IN    MX    10    ihr-server.de.
```

### 4. E-Mail senden

Senden Sie eine E-Mail an die generierte Adresse (z.B. `test-webhook@mailhook.local`).

### 5. Webhook empfangen

Ihr Webhook empfängt einen POST Request mit folgendem JSON-Body:

```json
{
  "from": {
    "address": "sender@example.com",
    "name": "Sender Name"
  },
  "to": "test-webhook@mailhook.local",
  "subject": "Test E-Mail",
  "text": "Textinhalt der E-Mail",
  "html": "<p>HTML Inhalt der E-Mail</p>",
  "headers": {
    "message-id": "<...>",
    "date": "..."
  },
  "attachments": [
    {
      "filename": "dokument.pdf",
      "contentType": "application/pdf",
      "size": 12345
    }
  ]
}
```

### Webhook-Signatur verifizieren

Wenn Sie ein Secret konfiguriert haben, enthält der Request einen `X-MailHook-Signature` Header:

```javascript
import crypto from 'crypto';

function verifySignature(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return signature === expectedSignature;
}

// Express.js Beispiel
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-mailhook-signature'];
  const secret = 'your-webhook-secret';
  
  if (!verifySignature(req.body, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }
  
  const data = JSON.parse(req.body.toString());
  console.log('Received email:', data);
  
  res.send('OK');
});
```

## API Endpoints

### GET /api/config
Gibt die verfügbaren Domains zurück.

### GET /api/hooks
Listet alle E-Mail Hooks auf.

### POST /api/hooks
Erstellt einen neuen E-Mail Hook.

**Body:**
```json
{
  "username": "test",
  "domain": "mailhook.local",
  "webhookUrl": "https://example.com/webhook",
  "webhookSecret": "optional-secret"
}
```

### PATCH /api/hooks/:id
Aktualisiert einen E-Mail Hook.

**Body:**
```json
{
  "webhookUrl": "https://new-url.com/webhook",
  "webhookSecret": "new-secret",
  "isEnabled": false
}
```

### DELETE /api/hooks/:id
Löscht einen E-Mail Hook.

### GET /api/hooks/:id/logs
Gibt die letzten Logs für einen Hook zurück.

### GET /api/logs
Gibt die letzten Logs für alle Hooks zurück.

## Produktions-Deployment

### Port 25 verwenden

Um Port 25 ohne Root-Rechte zu verwenden:

```bash
sudo setcap 'cap_net_bind_service=+ep' $(which node)
```

### Systemd Service

Erstellen Sie `/etc/systemd/system/mailhook.service`:

```ini
[Unit]
Description=MailHook SMTP to Webhook Service
After=network.target

[Service]
Type=simple
User=mailhook
WorkingDirectory=/opt/mailhook
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Aktivieren und starten:
```bash
sudo systemctl enable mailhook
sudo systemctl start mailhook
sudo systemctl status mailhook
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name mailhook.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Entwicklung

Das Projekt besteht aus folgenden Hauptkomponenten:

- `src/index.js` - Haupteinstiegspunkt
- `src/config.js` - Konfigurationsverwaltung
- `src/database/db.js` - Datenbanklogik (SQLite)
- `src/smtp/server.js` - SMTP Server Implementierung
- `src/webhook/webhook.js` - Webhook Trigger und Signierung
- `src/web/server.js` - Web API (Fastify)
- `src/web/public/index.html` - Web Interface (Vanilla JS)

## Lizenz

MIT

## Credits

Inspiriert von [OwlRelay](https://github.com/papra-hq/owlrelay) by Papra HQ
Email to Webhook
