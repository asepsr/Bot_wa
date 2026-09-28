# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Salin file dependensi
COPY package*.json ./

# Install semua dependensi termasuk devDependencies untuk build
RUN npm ci

# Salin seluruh source code bot
COPY . .

# Build TypeScript ke JavaScript (hasil di folder dist)
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Set env ke production
ENV NODE_ENV=production

# Salin file dependensi
COPY package*.json ./

# Install hanya dependensi produksi (menghemat ukuran image)
RUN npm ci --only=production

# Salin hasil build dari stage builder
COPY --from=builder /app/dist ./dist

# Buat folder session untuk menyimpan sesi WhatsApp agar tidak logout saat container restart
RUN mkdir -p /app/session

# Expose port (sesuai dengan PORT di .env)
EXPOSE 3000

# Jalankan bot dari folder dist
CMD ["node", "dist/index.js"]
