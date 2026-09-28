import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

export const sessionService = {
  getSessionPath(): string {
    return path.resolve(config.sessionPath);
  },

  async ensureSessionDir(): Promise<void> {
    const sessionPath = this.getSessionPath();
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
  },

  getSessionCredsPath(): string {
    return path.join(this.getSessionPath(), 'creds.json');
  },

  getSessionFile(): string {
    return path.join(this.getSessionPath(), 'session.json');
  },
};
