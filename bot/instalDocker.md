# Jalankan Bot WhatsApp di Docker aaPanel — Step by Step

Bot ini sudah siap Docker (`Dockerfile` + `docker-compose.yml`).
Panduan ini untuk **aaPanel Linux** (dengan plugin **Docker Manager**).

---

## 1. Prasyarat

1. VPS dengan aaPanel terinstall (Ubuntu 20.04 / 22.04 direkomendasikan).
2. Di aaPanel: **App Store > Docker Manager > Install**.
   Pastikan status Docker `Running`.
3. Catat info Laravel utama kamu:
   - URL Laravel, contoh: `https://tokomu.com` atau `http://IP-VPS:8000`
   - `API_KEY` yang sama dengan di Laravel (`X-Bot-API-Key`)
   - Port yang mau dipakai bot, default `3000`

> PENTING: `BOT_API_URL=http://localhost:8000` di `.env` contoh **tidak akan jalan** di VPS kalau Laravel ada di luar container Docker. Ganti dengan URL/IP publik Laravel.

---

## 2. Upload Project ke VPS

### Opsi A — via Git (disarankan)

1. Di aaPanel: **Terminal** (atau SSH pakai PuTTY/Termius).
2. Jalankan:

```bash
cd /www/wwwroot
git clone <URL-REPO-KAMU> waserver-bot
cd waserver-bot
ls -la
```

Pastikan terlihat: `Dockerfile`, `docker-compose.yml`, `package.json`, `src/`.

### Opsi B — via File Manager aaPanel

1. aaPanel > **Files** > masuk ke `/www/wwwroot/`.
2. Buat folder `waserver-bot`.
3. Upload ZIP project > **Extract**.
4. Pastikan struktur sama seperti di atas.

---

## 3. Buat File `.env` Produksi

1. Di Terminal:

```bash
cd /www/wwwroot/waserver-bot
cp .env.example .env
nano .env
```

2. Isi seperti ini (sesuaikan):

```env
BOT_API_URL=https://tokomu.com
BOT_WEBHOOK_PATH=/bot/webhook
SESSION_PATH=./session
PORT=3000
BOT_NAME=OrderBot
API_KEY=isi-dengan-api-key-yang-sama-di-laravel
SHOP_URL=https://tokomu.com
SHOP_PHONE=+6281234567890
```

Penjelasan:
- `BOT_API_URL` = alamat Laravel yang bisa diakses **dari dalam container Docker**. Pakai domain publik / IP publik, jangan `localhost` kecuali Laravel satu Docker network.
- `API_KEY` = harus sama persis dengan key di Laravel, karena dipakai untuk header `X-Bot-API-Key` di endpoint `/status`, `/send`, `/session/reset`.
- `PORT` = port di dalam container. Kalau di VPS port 3000 sudah dipakai, ganti misal `3001` dan sesuaikan juga `docker-compose.yml` (lihat langkah 4).

3. Simpan: `Ctrl+O`, `Enter`, `Ctrl+X`.

Cek `src/config/*` kalau ada — pastikan baca `PORT` dan `SESSION_PATH` dari env (project ini sudah begitu).

---

## 4. Cek `docker-compose.yml`

File bawaan sudah benar:

```yaml
services:
  whatsapp-bot:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: whatsapp-order-bot
    restart: always
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./session:/app/session
    env_file:
      - .env
```

Catatan:
- `restart: always` = container auto-jalan lagi setelah reboot VPS — wajib untuk bot WA.
- Volume `./session:/app/session` = sesi WhatsApp tersimpan di host, jadi **tidak logout** saat rebuild/restart. Jangan hapus folder `session/` kecuali mau pairing ulang.
- `EXPOSE 3000` di `Dockerfile` harus cocok dengan `PORT`. Kalau kamu ganti `PORT=3001`, mapping menjadi `3001:3000` tetap jalan, tapi lebih rapi samakan internal tetap 3000.

---

## 5. Build & Jalankan

### Opsi A — via Terminal (paling mudah)

```bash
cd /www/wwwroot/waserver-bot

# build image + jalan di background
docker compose up -d --build

# cek status
docker ps
docker compose ps
docker logs -f whatsapp-order-bot
```

`Ctrl+C` untuk keluar dari log (container tetap jalan).

### Opsi B — via UI aaPanel Docker Manager

1. aaPanel > **Docker > Compose**.
2. **Add Compose Project**:
   - Name: `waserver-bot`
   - Path: `/www/wwwroot/waserver-bot`
   - File: pilih `docker-compose.yml`
3. Klik **Up / Start**.
4. Lihat log di **Container > whatsapp-order-bot > Logs**.

Kalau error `docker-compose: command not found`, pakai `docker compose` (spasi, tanpa strip) — versi baru Docker memang begitu.

---

## 6. Scan QR WhatsApp (Pairing Pertama)

Pada start pertama belum ada `session/`, bot akan cetak QR.

### Cara 1 — dari log (termudah)

```bash
docker logs -f whatsapp-order-bot
```

Tunggu tulisan:

```
📱 QR CODE DETECTED!
Scan QR code above with WhatsApp on your phone!
```

Scan dengan **WhatsApp HP > Setelan > Perangkat Tertaut > Tautkan Perangkat**.

Kalau QR di terminal sulit di-scan, pakai Cara 2.

### Cara 2 — dari endpoint `/status`

Endpoint ini mengembalikan QR sebagai `data:image/png;base64`:

```bash
curl -H "X-Bot-API-Key: API_KEY_KAMU" http://127.0.0.1:3000/status
```

Buka JSON `qr` di browser (copy `data:image...` ke address bar) lalu scan.

Setelah `connected`, log akan tampil:

```
✅ WhatsApp connected successfully!
```

Folder `session/` di host akan terisi file kredensial — **jangan dihapus**.

> QR hanya muncul 1x. Pairing berikutnya tidak perlu scan kecuali kamu reset/hapus `session/`.

---

## 7. Buka Akses / Firewall & Reverse Proxy (Opsional tapi Disarankan)

### a. Buka port di aaPanel

aaPanel > **Security** > buka TCP port bot, misal `3000`.

Tes dari luar:

```bash
curl http://IP-VPS:3000/health
# {"status":"ok",...}
```

### b. Pasang domain + HTTPS (disarankan untuk webhook Laravel)

Kalau Laravel memanggil bot via domain, buat reverse proxy:

1. aaPanel > **Website > Add Site** misal `bot.tokomu.com`.
2. **Settings > Reverse Proxy > Add**:
   - Target URL: `http://127.0.0.1:3000`
3. **SSL > Let's Encrypt > Apply**.
4. Tes: `https://bot.tokomu.com/health`

Laravel `BOT_API_URL` tetap domain Laravel, bukan domain bot — yang butuh domain adalah kalau kamu expose `/send` ke Laravel. Sesuaikan arsitekturmu.

---

## 8. Perintah Operasional Sehari-hari

Jalankan dari folder project `/www/wwwroot/waserver-bot`:

```bash
# lihat log live
docker logs -f whatsapp-order-bot

# restart bot
docker restart whatsapp-order-bot
# atau
docker compose restart

# stop / start
docker compose stop
docker compose start

# rebuild setelah update kode
git pull
docker compose up -d --build

# cek resource
docker stats whatsapp-order-bot
```

Reset sesi WA (pairing ulang tanpa hapus container):

```bash
curl -X POST \
  -H "X-Bot-API-Key: API_KEY_KAMU" \
  http://127.0.0.1:3000/session/reset
```

Lalu lihat log lagi untuk QR baru.

Logout:

```bash
curl -X POST \
  -H "X-Bot-API-Key: API_KEY_KAMU" \
  http://127.0.0.1:3000/logout
```

---

## 9. Update Kode Baru

```bash
cd /www/wwwroot/waserver-bot
git pull
docker compose up -d --build
docker logs -f whatsapp-order-bot --tail 100
```

Karena `session/` di-mount sebagai volume, update tidak membuat logout.

---

## 10. Backup Session ( Penting )

Tanpa backup, kalau VPS rusak kamu harus scan ulang dan ada risiko nomor WA kena limit tautan.

```bash
# backup manual
tar -czf ~/wa-session-backup-$(date +%F).tar.gz -C /www/wwwroot/waserver-bot session .env docker-compose.yml
ls -lh ~/*.tar.gz
```

Download file backup via aaPanel **Files** dan simpan di tempat aman.

Restore:

```bash
tar -xzf ~/wa-session-backup-YYYY-MM-DD.tar.gz -C /www/wwwroot/waserver-bot
docker compose up -d
```

---

## 11. Troubleshooting

| Gejala | Penyebab / Solusi |
|---|---|
| `port is already allocated` | Port 3000 dipakai app lain. Ganti `PORT=3001` di `.env`, lalu `docker compose up -d`. Jangan lupa buka port baru di Security. |
| `Cannot find module dist/index.js` | Build gagal. Cek `docker logs`, pastikan `npm run build` sukses lokal (`tsc` tanpa error). Lalu `docker compose build --no-cache`. |
| Loop `Connection closed, reconnecting...` / `408 Timed Out` | Jaringan VPS lambat ke server WA. Project ini sudah set `fireInitQueries: false` dan timeout 120s. Tunggu 2–5 menit, biasanya connect sendiri. Kalau terus, restart container. |
| `loggedOut` / diminta scan terus | Session corrupt. `POST /session/reset` atau `rm -rf session/*` lalu restart dan scan ulang. |
| `401 Unauthorized` di `/status` `/send` | Header salah. Harus `X-Bot-API-Key` sama persis dengan `API_KEY` di `.env`. |
| Laravel tidak bisa hubungi bot | `BOT_API_URL` masih `localhost`. Ganti ke domain/IP publik. Tes dari dalam container: `docker exec whatsapp-order-bot wget -qO- http://...` |
| Container `Exited` terus | Cek `docker logs whatsapp-order-bot --tail 200`. Umumnya `.env` hilang atau `PORT` bentrok. Pastikan `env_file: - .env` dan file `.env` ada. |
| Disk penuh | `docker system prune -a --volumes` HATI-HATI: jangan pakai `--volumes` kalau tidak paham — bisa hapus data. Cek dulu `df -h` dan `docker system df`. |

Cek kesehatan cepat:

```bash
docker ps --filter name=whatsapp-order-bot
curl http://127.0.0.1:3000/health
curl -H "X-Bot-API-Key: API_KEY_KAMU" http://127.0.0.1:3000/status
```

---

## Checklist Selesai

- [ ] Docker Manager installed & running
- [ ] Project di `/www/wwwroot/waserver-bot`
- [ ] `.env` produksi sudah benar (`BOT_API_URL` publik + `API_KEY` sama dengan Laravel)
- [ ] `docker compose up -d --build` sukses, `docker ps` = Up
- [ ] QR di-scan, `/status` = `connected`
- [ ] Port dibuka di Security / reverse proxy bila perlu
- [ ] Backup `session/` + `.env` tersimpan
