import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Project root = folder yang berisi package.json & .env (parent dari src/ atau dist/).
// Diselesaikan absolut dari lokasi file ini agar tidak tergantung exec cwd PM2
// (aaPanel menjalankan dengan cwd = dist/, bukan bot/).
const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '../..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });

export const config = {
  apiUrl: process.env.BOT_API_URL || 'http://localhost:8000',
  apiKey: process.env.API_KEY || 'bot-secret-key-2024',
  webhookPath: process.env.BOT_WEBHOOK_PATH || '/bot/webhook',
  sessionPath: process.env.SESSION_PATH || './session',
  port: parseInt(process.env.PORT || '3000'),
};
