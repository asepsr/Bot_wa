# Setup Production aaPanel — Backend + Bot WhatsApp

> Backend: `https://apps.aspsr.xyz` (Laravel)
> Bot: `https://bot.aspsr.xyz` (Baileys Node.js + Express)
> Terakhir diverifikasi dari kode: `bot/src/index.ts`, `bot/src/config/index.ts`, `bot/src/services/apiService.ts`, `backend/routes/api.php`, `backend/config/bot.php`, `backend/config/services.php`

---

## 1. Arsitektur & Dari Mana API Bot Berasal

Tidak ada API pihak ketiga (bukan Fonnte/Wablas). API bot adalah **kode kamu sendiri**.

```
WhatsApp User ⇄ Bot:3000 ⇄ Laravel API ⇄ MySQL
                  :3000 = Express di bot/src/index.ts
                  Laravel = backend/routes/api.php
```

### 1.1 Dua API yang saling memanggil

| Arah | Pemanggil → Tujuan | Base URL Production | Auth |
|------|-------------------|---------------------|------|
| Bot → Laravel | Bot (`apiService.ts`) → Laravel | `https://apps.aspsr.xyz` | Header `X-Bot-API-Key` |
| Laravel → Bot | Laravel (`AdminController::botRequest()`) → Bot | `https://bot.aspsr.xyz` | Header `X-Bot-API-Key` yang sama |

### 1.2 Endpoint Laravel (`https://apps.aspsr.xyz/api/*`)

Semua wajib header `X-Bot-API-Key` (via `BotAuthMiddleware`). Prefix `api/` otomatis.

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/products` | List produk aktif (paginate 15) |
| GET | `/api/products/{id}` | Detail produk |
| POST/PUT/DELETE | `/api/products`, `/api/products/{id}` | CRUD produk |
| GET | `/api/orders` | List order + `customer`, `items.product` |
| GET | `/api/orders/{id\|order_number}` | Detail (bisa `ORD-...` untuk `ORDER_STATUS`) |
| POST | `/api/orders` | Buat order `{wa_id, wa_name, items:[{product_id, quantity}]}` |
| GET | `/api/customers/{waId}/orders` | 10 order terakhir 1 customer |
| GET/POST | `/api/payments`, `/api/payments/{id}` | Riwayat pembayaran |
| GET | `/api/bot-settings` | Template pesan (dipolling bot tiap 30 detik) |
| POST | `/api/webhook` | Echo (butuh key) |
| POST | `/bot/webhook` | Handler sama, tanpa auth (untuk test) |

### 1.3 Endpoint Bot (`https://bot.aspsr.xyz/*`)

Didefinisikan di `bot/src/index.ts:31-121`.

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/bot/webhook` (ikut `BOT_WEBHOOK_PATH`) | publik | `{waId, waName, message}` | `{success:true, response:"<teks>"}` |
| GET | `/health` | publik | — | `{status:"ok", timestamp}` |
| GET | `/status` | `X-Bot-API-Key` | — | `{connection:"qr\|connected", number, qr:"data:image/png;base64..."}` |
| POST | `/send` | `X-Bot-API-Key` | `{waId, message}` | `{success:true}` / `503` bila WA offline |
| POST | `/session/reset` | `X-Bot-API-Key` | — | Reset sesi, QR baru |
| POST | `/logout` | `X-Bot-API-Key` | — | Logout perangkat WA |

### 1.4 API Key — bikin sendiri, bukan didapat

Key harus **sama persis** di kedua sisi, kalau beda → `401 Unauthorized`.

| File | Variabel | Dibaca di kode |
|------|----------|----------------|
| `backend/.env` | `WHATSAPP_API_KEY` | `backend/config/services.php` → `services.whatsapp.api_key` |
| `bot/.env` | `API_KEY` | `bot/src/config/index.ts` → `config.apiKey` |

Nilai default lokal `bot-secret-key-2024` — **wajib ganti di production**. Generate misal:

```bash
openssl rand -hex 24
```

---

## 2. Prasyarat aaPanel

1. VPS Ubuntu 20.04 / 22.04, aaPanel terinstall.
2. Site backend sudah jalan: `apps.aspsr.xyz` (PHP 8.2 + MySQL, Laravel sudah deploy).
3. Site bot sudah dibuat: `bot.aspsr.xyz` (belum diisi / siap dipasang reverse proxy).
4. Install dari App Store:
   - `Node Version Manager` → Node **20.x**
   - `PM2 Manager` (rekomendasi utama) **atau** `Docker Manager` (alternatif)
   - SSL via Let's Encrypt untuk kedua domain.
5. Buka port di menu **Security**: `3000` (hanya bila tes langsung via IP; bila full reverse proxy + domain, port boleh tetap tertutup dari publik).

---

## 3. Konfigurasi Backend (`apps.aspsr.xyz`)

Edit di aaPanel → **Files** → `/www/wwwroot/apps/backend/.env` (sesuaikan path site kamu), atau via Terminal/SSH.

```env
APP_NAME=WhatsAppOrderBot
APP_ENV=production
APP_DEBUG=false
APP_URL=https://apps.aspsr.xyz

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=whatsapp_bot
DB_USERNAME=root
DB_PASSWORD=isi-password-mysql-aaPanel

# === KONEKSI KE BOT (WAJIB) ===
WHATSAPP_API_KEY=PASTE-KEY-32-CHAR-YANG-SAMA-DENGAN-BOT
BOT_SERVICE_URL=https://bot.aspsr.xyz
```

> `BOT_SERVICE_URL` dibaca `backend/config/bot.php:4` sebagai `config('bot.service_url')`. Dipakai admin untuk `GET /status`, `POST /send`, `POST /session/reset`, `POST /logout`.
> Kalau bot + backend **1 VPS yang sama**, boleh isi `http://127.0.0.1:3000` agar tidak tergantung DNS/SSL. Kalau beda VPS, wajib URL publik `https://bot.aspsr.xyz`.

Setelah edit:

```bash
cd /www/wwwroot/apps/backend
php artisan config:clear
php artisan cache:clear
php artisan migrate --force
```

---

## 4. Deploy Bot — Opsi A: PM2 (Disarankan)

Paling ringan, log QR gampang, `session/` mudah dibackup.

### 4.1 Upload kode

Opsi Git:

```bash
cd /www/wwwroot
git clone <URL-REPO-KAMU> waserver-bot
cd waserver-bot
ls -la   # pastikan ada Dockerfile, package.json, src/
```

Opsi ZIP: aaPanel → **Files** → `/www/wwwroot/waserver-bot` → Upload ZIP → Extract.

Kalau repo berisi monorepo (`backend/` + `bot/`), yang dipakai hanya folder `bot/`:

```bash
cd /www/wwwroot/waserver-bot/bot
# atau pindahkan isi bot/ ke /www/wwwroot/waserver-bot agar rapi
```

### 4.2 Buat `.env` produksi

```bash
cd /www/wwwroot/waserver-bot
cp .env.example .env
nano .env
```

Isi (sesuaikan key):

```env
BOT_API_URL=https://apps.aspsr.xyz
BOT_WEBHOOK_PATH=/bot/webhook
SESSION_PATH=./session
PORT=3000
BOT_NAME=OrderBot
API_KEY=PASTE-KEY-SAMA-DENGAN-WHATSAPP_API_KEY
SHOP_URL=https://apps.aspsr.xyz
SHOP_PHONE=+6281234567890
```

> PENTING: `BOT_API_URL` = Laravel publik, **jangan `localhost`** kecuali Laravel satu network. Ini dibaca `bot/src/config/index.ts:2` dan dipakai `apiService.ts` sebagai `baseURL` + header `X-Bot-API-Key` otomatis.

### 4.3 Install, build, jalan dengan PM2

```bash
cd /www/wwwroot/waserver-bot
node -v   # harus v20
npm ci
npm run build
pm2 start dist/index.js --name whatsapp-bot
pm2 save
pm2 startup   # ikuti instruksi agar auto-start saat reboot
pm2 logs whatsapp-bot
```

Tunggu log:

```
🤖 Bot webhook server running on port 3000
📱 QR CODE DETECTED!
Scan QR code above with WhatsApp on your phone!
```

Scan via **WhatsApp HP → Perangkat Tertaut → Tautkan Perangkat**. Setelah itu:

```
✅ WhatsApp connected successfully!
```

Folder `session/` akan terisi — **jangan dihapus** kecuali mau pairing ulang.

### 4.4 Reverse proxy `bot.aspsr.xyz` → bot

1. aaPanel → **Website** → pilih `bot.aspsr.xyz` → **Reverse Proxy** → Add:
   - Target URL: `http://127.0.0.1:3000`
2. **SSL** → Let's Encrypt → Apply + Force HTTPS.
3. Tes:

```bash
curl https://bot.aspsr.xyz/health
# {"status":"ok",...}
```

---

## 5. Deploy Bot — Opsi B: Docker (Alternatif)

Gunakan bila mau isolasi image. File sudah siap: `Dockerfile` + `docker-compose.yml`.

```bash
cd /www/wwwroot/waserver-bot
cp .env.example .env
nano .env   # isi sama seperti Opsi A bagian 4.2
docker compose up -d --build
docker ps
docker logs -f whatsapp-order-bot
```

Catatan:

- `restart: always` = auto-jalan setelah reboot.
- Volume `./session:/app/session` = sesi WA tidak hilang saat rebuild.
- Mapping `${PORT:-3000}:3000` — internal tetap `3000`.
- Bila `port is already allocated`, ganti `PORT=3001` di `.env` lalu `docker compose up -d`.
- Update kode: `git pull` lalu `docker compose up -d --build` (session tetap aman karena volume).
- Alternatif via UI: aaPanel → **Docker → Compose** → Add project path `/www/wwwroot/waserver-bot`.

Reverse proxy dan SSL sama seperti Opsi A bagian 4.4.

---

## 6. Verifikasi End-to-End

Ganti `KEY_KAMU` dengan nilai `WHATSAPP_API_KEY` / `API_KEY`.

```bash
KEY=KEY_KAMU

# 1. Bot hidup?
curl https://bot.aspsr.xyz/health

# 2. Bot konek WA? (harus connection=connected)
curl -H "X-Bot-API-Key: $KEY" https://bot.aspsr.xyz/status

# 3. Bot bisa hubungi Laravel?
curl -H "X-Bot-API-Key: $KEY" https://apps.aspsr.xyz/api/products
curl -H "X-Bot-API-Key: $KEY" https://apps.aspsr.xyz/api/bot-settings

# 4. Buat order via API (simulasi bot)
curl -X POST https://apps.aspsr.xyz/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Bot-API-Key: $KEY" \
  -d '{"wa_id":"6281234567890@s.whatsapp.net","wa_name":"Test","items":[{"product_id":1,"quantity":1}]}'

# 5. Laravel bisa hubungi bot? (kirim WA)
curl -X POST https://bot.aspsr.xyz/send \
  -H "Content-Type: application/json" \
  -H "X-Bot-API-Key: $KEY" \
  -d '{"waId":"6281234567890@s.whatsapp.net","message":"Tes dari server"}'

# 6. Webhook bot (simulasi pesan masuk)
curl -X POST https://bot.aspsr.xyz/bot/webhook \
  -H "Content-Type: application/json" \
  -d '{"waId":"6281234567890@s.whatsapp.net","waName":"Test","message":"PRODUCT"}'
```

Lalu kirim WA asli ke nomor bot: `PRODUCT`, `ORDER`, `MY_ORDERS`, `HELP`. Cek juga halaman admin Laravel `/admin/whatsapp` (harus tampil QR/status, bukan error `Layanan bot tidak aktif`).

---

## 7. Operasional Harian

```bash
# PM2
pm2 logs whatsapp-bot
pm2 restart whatsapp-bot
pm2 stop whatsapp-bot
pm2 start whatsapp-bot

# Docker
docker logs -f whatsapp-order-bot
docker restart whatsapp-order-bot
docker compose stop
docker compose start
cd /www/wwwroot/waserver-bot; git pull; docker compose up -d --build
```

Reset sesi (pairing ulang tanpa hapus container):

```bash
curl -X POST -H "X-Bot-API-Key: KEY_KAMU" https://bot.aspsr.xyz/session/reset
# lalu lihat log untuk QR baru
```

Logout:

```bash
curl -X POST -H "X-Bot-API-Key: KEY_KAMU" https://bot.aspsr.xyz/logout
```

Backup session (penting — tanpa ini nomor bisa kena limit tautan bila hilang):

```bash
tar -czf ~/wa-session-backup-$(date +%F).tar.gz -C /www/wwwroot/waserver-bot session .env docker-compose.yml
ls -lh ~/*.tar.gz
```

Restore:

```bash
tar -xzf ~/wa-session-backup-YYYY-MM-DD.tar.gz -C /www/wwwroot/waserver-bot
pm2 restart whatsapp-bot
# atau: docker compose up -d
```

---

## 8. Troubleshooting

| Gejala | Penyebab / Solusi |
|--------|-------------------|
| `401 Unauthorized` di `/api/*` atau `/status` `/send` | Key beda / header salah. Harus `X-Bot-API-Key` sama persis di `backend/.env` (`WHATSAPP_API_KEY`) dan `bot/.env` (`API_KEY`). Lalu `php artisan config:clear` + restart bot. |
| `503 WhatsApp is not connected` saat `/send` | Socket WA offline. Cek `/status`, scan ulang QR, cek log `Connection closed, reconnecting...`. |
| Loop `408 Timed Out` / reconnect terus | Jaringan VPS lambat ke server WA. Project sudah set `fireInitQueries:false` + timeout 120s. Tunggu 2–5 menit, restart bila perlu. |
| `port is already allocated` | Port 3000 dipakai app lain. Ganti `PORT=3001`, restart, sesuaikan reverse proxy target. |
| `Cannot find module dist/index.js` | Build gagal. Jalankan lokal `npx tsc --noEmit`, perbaiki error TS, `npm run build` ulang. |
| `loggedOut` / diminta scan terus | Session corrupt. `POST /session/reset` atau `rm -rf session/*` + restart + scan ulang. |
| Admin `/admin/whatsapp` = `Layanan bot tidak aktif` | `BOT_SERVICE_URL` salah / bot mati / firewall. Tes dari VPS: `curl http://127.0.0.1:3000/health`. Bila 1 VPS, pakai `http://127.0.0.1:3000` bukan domain. |
| `POST /api/customers` 404 (perintah `CUSTOMER` gagal) | Bug known: bot memanggil endpoint yang belum ada di Laravel (hanya `GET /api/customers/{waId}/orders` yang terdaftar). Perlu tambah route+controller bila fitur alamat dipakai. |
| Disk penuh | `docker system df`, `df -h`. Jangan `prune --volumes` sembarangan (bisa hapus session bila pakai named volume). |

Cek cepat:

```bash
pm2 status
curl http://127.0.0.1:3000/health
curl -H "X-Bot-API-Key: KEY_KAMU" http://127.0.0.1:3000/status
curl -H "X-Bot-API-Key: KEY_KAMU" https://apps.aspsr.xyz/api/products
```

---

## 9. Checklist Selesai

- [ ] `apps.aspsr.xyz` jalan (Laravel + SSL), `APP_URL` = domain publik
- [ ] `WHATSAPP_API_KEY` (backend) = `API_KEY` (bot)
- [ ] `BOT_API_URL` (bot) = `https://apps.aspsr.xyz`
- [ ] `BOT_SERVICE_URL` (backend) = `https://bot.aspsr.xyz` (atau `http://127.0.0.1:3000` bila 1 VPS)
- [ ] Bot jalan via PM2 / Docker, `pm2 status` / `docker ps` = Up
- [ ] `bot.aspsr.xyz` reverse proxy → `127.0.0.1:3000` + SSL, `/health` = ok
- [ ] `/status` = `connected` + ada `number`
- [ ] Test order + `/send` + chat WA asli sukses
- [ ] Backup `session/` + `.env` tersimpan
- [ ] `APP_DEBUG=false` di backend production
