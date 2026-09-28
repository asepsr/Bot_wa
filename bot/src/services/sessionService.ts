import fs from 'fs';
import path from 'path';
import { config, projectRoot } from '../config/index.js';

export const sessionService = {
  getSessionPath(): string {
    // Resolve relatif terhadap project root (bukan cwd) agar konsisten
    // baik via `tsx src/`, `node dist/`, maupun PM2 aaPanel (cwd = dist/).
    const p = config.sessionPath;
    return path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
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
