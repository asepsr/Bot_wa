# Refactor: WA Gateway Fleksibel — Dokumentasi

> Tujuan: bot WhatsApp menjadi **server WA mandiri** yang bisa dipakai sistem mana saja
> (Laravel, Python, Go, PHP native) via HTTP + `X-Bot-API-Key`.
> Status: **rancangan disetujui 29 Sep 2026, Fase 1 belum dikerjakan.**
> Pengaman: tag `v1-stabil-20260929` (main stabil) + branch ini `refactor/gateway` (kerja refactor).

---

## 1. Titik Aman (jangan dihapus)

| Penanda | Isi | Kembali darurat |
|---------|-----|-----------------|
| Tag `v1-stabil-20260929` | main stabil 29 Sep 2026: bot↔backend nyambung, WA connected, `PRODUCT`/`ORDER` jalan | `git checkout v1-stabil-20260929` |
| Branch `main` | versi production jalan di VPS | `git checkout main` |
| Branch `refactor/gateway` (ini) | tempat kerja refactor, boleh rusak | — |
| Backup VPS `~/Bot_wa-full-backup-20260929.tar.gz` + `~/wa-session-backup-*.tar.gz` | folder + sesi WA | extract lalu `pm2 restart` |

> Backup folder **jangan pernah di-start** (2 bot × 1 sesi WA = rebutan koneksi).

Buat pengaman di VPS:

```bash
cd /www/wwwroot/Bot_wa
git fetch botwa --tags
git tag v1-stabil-20260929            # bila belum ada
git checkout -b refactor/gateway     # kerja di sini
cp -a /www/wwwroot/Bot_wa /www/wwwroot/Bot_wa-backup-20260929
tar -czf ~/Bot_wa-full-backup-20260929.tar.gz -C /www/wwwroot Bot_wa-backup-20260929
```

---

## 2. Prinsip

* **Gateway** = hanya urusan WhatsApp: koneksi Baileys, sesi/QR, kirim, terima. Tidak tahu apa itu order/produk.
* **Business** = logika tiap sistem (order, CS, notifikasi). Terima webhook + panggil API gateway.
* Kompatibel mundur: path lama (`/send`, `/status`, `/health`, `/bot/webhook`) **tetap**, `apps.aspsr.xyz` tidak perlu diubah.

```
Sistem A ─┐   POST /send                ┌─► WhatsApp
Sistem B ─┼─► WA Gateway (:3000) ───────┘
Sistem C ─┘   ▲ forward pesan masuk (POST FORWARD_URL)
```

---

## 3. Struktur repo target

```
bot/
├── src/
│   ├── gateway/                  # inti, stabil, jarang berubah
│   │   ├── connection.ts         # startWhatsApp, QR, reconnect (pindahan index.ts)
│   │   ├── sessionStore.ts       # ensureSessionDir, paths (sessionService saat ini)
│   │   ├── server.ts             # express app + auth middleware
│   │   ├── routes.ts             # /health /status /send* /session/reset /logout
│   │   ├── forwarder.ts          # teruskan pesan masuk ke FORWARD_URL (retry+sign)
│   │   └── sendQueue.ts          # antrean kirim (1 pesan / ~1-2 dtk, anti-limit WA)
│   ├── business-order/           # logika order saat ini PINDAH ke sini (contoh implementasi)
│   │   ├── handlers/             # messageHandler, commandParser, dst. (existing)
│   │   ├── services/             # apiService, messageService (existing)
│   │   └── webhook.ts            # POST /business/order/webhook ← target FORWARD_URL
│   └── index.ts                  # rakit gateway + (opsional) business lokal
```

---

## 4. Config baru (`.env`)

```env
PORT=3000
API_KEY=...
SESSION_PATH=./session
# --- baru (Fase 2+) ---
FORWARD_URL=                    # kosong = mode lokal (business-order built-in, perilaku sekarang)
FORWARD_SECRET=                 # HMAC signing webhook keluar
FORWARD_TIMEOUT_MS=5000
FORWARD_RETRIES=3
SEND_DELAY_MS=1200              # jeda antar pesan keluar
MAX_MEDIA_MB=5
```

---

## 5. Kontrak API gateway v1 (stabil)

| Method | Endpoint | Auth | Body | Status |
|--------|----------|------|------|--------|
| GET | `/health` | — | — | ada, tetap |
| GET | `/status` | key | — | ada, tetap (+`qr`) |
| POST | `/send` | key | `{waId, message}` | ada, tetap (masuk antrean Fase 3) |
| POST | `/send-image` | key | `{waId, imageUrl\|base64, caption}` | baru (Fase 3) |
| POST | `/send-document` | key | `{waId, fileUrl\|base64, filename}` | baru (Fase 3) |
| GET | `/contacts/check/:phone` | key | — | baru (Fase 3) |
| POST | `/session/reset` | key | — | ada, tetap |
| POST | `/logout` | key | — | ada, tetap |

Payload forward pesan masuk ke `FORWARD_URL` (Fase 2):

```json
{ "event": "message", "waId": "628..@s.whatsapp.net", "waName": "...", "text": "...", "timestamp": "..." }
```

Header: `X-Gateway-Signature: hmac-sha256(body, FORWARD_SECRET)`, retry 3x backoff.
`FORWARD_URL` kosong → fallback business lokal (nol downtime migrasi).

---

## 6. Multi-sesi / multi-sistem

* Jangka pendek: 1 proses = 1 nomor (`SESSION_PATH` + `PORT` beda per instance, proxy domain beda). Cukup untuk 2–5 nomor.
* Nanti bila perlu: `SESSION_ID` + session manager dalam 1 proses. Ditunda sampai ada kebutuhan nyata.

---

## 7. Tahapan

- [ ] **Fase 1** — pindah koneksi+server ke `gateway/` tanpa ubah perilaku (refactor murni). Verifikasi: `tsc`, `/health`, QR, `PRODUCT` tetap jalan.
- [ ] **Fase 2** — `forwarder.ts` + mode `FORWARD_URL`; business-order jadi service contoh.
- [ ] **Fase 3** — `sendQueue.ts` + `/send-image`, `/send-document`, `/contacts/check`.
- [ ] **Fase 4** — `GATEWAY_API.md` (kontrak untuk sistem lain) + versioning `/v1`.

Aturan main branch ini: tiap fase 1 commit, `tsc` hijau, test `/health` + chat WA sebelum lanjut.

---

## 8. Riwayat

* 29 Sep 2026 — rancangan disetujui; tag `v1-stabil-20260929`; branch `refactor/gateway` dibuat; file ini ditulis.
