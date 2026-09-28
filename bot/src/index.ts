import 'dotenv/config';
import { makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import express from 'express';
import fs from 'fs';
import winston from 'winston';
import { config } from './config/index.js';
import { sessionService } from './services/sessionService.js';
import { apiService } from './services/apiService.js';
import { extractCommandText } from './services/interactiveService.js';
import { handleMessage, isInteractiveResponse, toPlainText } from './handlers/messageHandler.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const app = express();
let whatsappSocket: WASocket | undefined;
let connectionStatus: 'connecting' | 'qr' | 'connected' | 'disconnected' = 'connecting';
let qrCode: string | undefined;
let connectedNumber: string | undefined;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function isAuthorized(req: express.Request): boolean {
  return req.header('X-Bot-API-Key') === config.apiKey;
}

app.post(config.webhookPath, async (req, res) => {
  try {
    const { waId, waName, message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'No message provided' });
    }
    const response = await handleMessage(waId, waName, message);
    // Webhook / API hanya pakai teks polos (tombol hanya untuk koneksi WA real-time)
    res.json({ success: true, response: toPlainText(response) });
  } catch (error: any) {
    logger.error('Webhook error:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/status', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  res.json({
    success: true,
    connection: connectionStatus,
    number: connectedNumber,
    qr: qrCode,
  });
});

app.post('/send', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { waId, message } = req.body;
  if (!waId || !message) {
    return res.status(422).json({ success: false, message: 'waId and message are required' });
  }
  if (!whatsappSocket) {
    return res.status(503).json({ success: false, message: 'WhatsApp is not connected' });
  }

  try {
    await whatsappSocket.sendMessage(waId, { text: message });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Outbound WhatsApp error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to send WhatsApp message' });
  }
});

app.post('/session/reset', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    connectionStatus = 'connecting';
    qrCode = undefined;
    connectedNumber = undefined;
    await whatsappSocket?.logout();
    whatsappSocket = undefined;
    fs.rmSync(sessionService.getSessionPath(), { recursive: true, force: true });
    setTimeout(() => startWhatsApp(), 500);
    res.json({ success: true, message: 'Sesi direset. QR baru akan tersedia segera.' });
  } catch (error: any) {
    logger.error('Session reset error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to reset WhatsApp session' });
  }
});

app.post('/logout', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    await whatsappSocket?.logout();
    whatsappSocket = undefined;
    connectionStatus = 'disconnected';
    qrCode = undefined;
    connectedNumber = undefined;
    res.json({ success: true });
  } catch (error: any) {
    logger.error('WhatsApp logout error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to log out WhatsApp device' });
  }
});

async function sendBotResponse(
  sock: NonNullable<typeof whatsappSocket>,
  jid: string,
  response: Awaited<ReturnType<typeof handleMessage>>
): Promise<void> {
  if (typeof response === 'string') {
    if (response) await sock.sendMessage(jid, { text: response });
    return;
  }
  if (isInteractiveResponse(response)) {
    // Kirim teks fallback karena native-flow tidak didukung oleh semua client WhatsApp.
    let imageSent = false;
    if (response.imageUrl) {
      try {
        const image = await apiService.getImage(response.imageUrl);
        await sock.sendMessage(jid, { image, caption: response.imageCaption });
        imageSent = true;
      } catch (e: any) {
        logger.warn('QRIS image failed, continue with text:', e.message);
      }
    }
    if (!imageSent) {
      await sock.sendMessage(jid, { text: response.fallbackText });
    }
    return;
  }
  if (response.text) {
    await sock.sendMessage(jid, { text: response.text });
  }
  if (response.imageUrl) {
    const image = await apiService.getImage(response.imageUrl);
    await sock.sendMessage(jid, {
      image,
      caption: response.imageCaption,
    });
  }
}

async function startWhatsApp() {
  try {
    connectionStatus = 'connecting';
    await sessionService.ensureSessionDir();

    const { state, saveCreds } = await useMultiFileAuthState(sessionService.getSessionPath());

    const sock = makeWASocket({
      browser: Browsers.macOS('Desktop'),
      auth: state,
      // Init queries (sync kontak/chat/label) sering 408 Timed Out di jaringan lambat.
      // Bot hanya butuh pesan live, jadi matikan + perpanjang timeout query.
      fireInitQueries: false,
      defaultQueryTimeoutMs: 120_000,
      connectTimeoutMs: 60_000,
      retryRequestDelayMs: 500,
    });
    whatsappSocket = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        connectionStatus = 'qr';
        qrCode = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        console.log('\n📱 QR CODE DETECTED!');
        console.log('========================================');
        console.log(await QRCode.toString(qr, { type: 'terminal' }));
        console.log('========================================');
        console.log('Scan QR code above with WhatsApp on your phone!\n');
      }
      if (connection === 'close') {
        whatsappSocket = undefined;
        connectionStatus = 'disconnected';
        connectedNumber = undefined;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          logger.warn('Connection closed, reconnecting...');
          setTimeout(() => startWhatsApp(), 3000);
        } else {
          logger.error('Connection closed. Scan QR code again.');
        }
      }
      if (connection === 'open') {
        connectionStatus = 'connected';
        qrCode = undefined;
        connectedNumber = sock.user?.id?.split('@')[0];
        logger.info('✅ WhatsApp connected successfully!');
        logger.info('📱 Waiting for messages...');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      const messages = m.messages;
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid || '';
  const isGroup = remoteJid.endsWith('@g.us');
        const senderJid = msg.key.participant || msg.key.remoteJid || '';
        const isFromBot = msg.key.fromMe;

        // Filter: skip groups and self-messages
        if (isGroup) {
          logger.info(`⏭️ Group message skipped: ${remoteJid}`);
          continue;
        }
        if (isFromBot) {
          logger.info(`⏭️ Self-message skipped: ${senderJid}`);
          continue;
        }

        const waId = remoteJid || 'unknown';
        const waName = msg.pushName || 'Unknown';
        // Termasuk klik Quick Reply / List / CTA (nativeFlow, buttons, list response)
        const text = extractCommandText(msg.message) || '';
        if (!text) {
          logger.warn(
            `⚠️ Bentuk pesan tak dikenal dari ${waName} (${waId}): ${Object.keys(msg.message || {}).join(',')}`
          );
        }

        logger.info(`📩 Message from ${waName} (${waId}): ${text.substring(0, 50)}`);

        try {
          const response = await handleMessage(waId, waName, text);
          await sendBotResponse(sock, remoteJid, response);
          logger.info(`📤 Reply sent to ${waName}`);
        } catch (error: any) {
          logger.error('Error sending reply:', error?.stack || error?.message || error);
          try {
            await sock.sendMessage(remoteJid, { text: '❌ Terjadi kesalahan. Silakan coba lagi.' });
          } catch {
            // abaikan, koneksi mungkin putus
          }
        }
      }
    });

    sock.ev.on('group-participants.update', async (m) => {
      const { id, author, action } = m;
      logger.info(`👥 ${action} by ${author} in group ${id}`);
    });

  } catch (error: any) {
    logger.error('Failed to start WhatsApp:', error.message);
    setTimeout(() => startWhatsApp(), 5000);
  }
}

app.listen(config.port, () => {
  logger.info(`🤖 Bot webhook server running on port ${config.port}`);
  logger.info(`📡 Webhook endpoint: ${config.webhookPath}`);
});

startWhatsApp();
