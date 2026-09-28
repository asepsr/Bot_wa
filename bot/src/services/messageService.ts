import { formatRupiah } from '../utils/constants.js';
import { apiService } from './apiService.js';

const defaults = {
  menu_message: '*MENU UTAMA*\n\n1. *PRODUCT* - Lihat daftar produk dan kode\n2. *ORDER* - Mulai pilih produk untuk keranjang\n3. *ORDER_STATUS <nomor>** - Cek status\n4. *MY_ORDERS* - Pesanan saya\n5. *HELP* - Bantuan',
  help_message: '*BANTUAN ORDER*\n\n1. Ketik *PRODUCT* untuk melihat kode produk.\n2. Ketik *ORDER*.\n3. Kirim kode produk.\n4. Kirim jumlah pcs.\n5. Ketik *LANJUT* untuk tambah produk atau *CHECKOUT* untuk bayar.\n\nKetik *CANCEL* untuk membatalkan keranjang.',
  order_success_message: '✅ *Pesanan Berhasil!*\n\n🔢 Nomor Order: *{order_number}*\n💰 Total: *{total_price}*\n📦 Status: *Menunggu pembayaran*\n\nKirim bukti transfer ke chat ini untuk melanjutkan.',
  order_status_message: '📋 *STATUS PESANAN*\n\n🔢 Nomor: *{order_number}*\n\n🛍️ *DETAIL PESANAN*\n{items}\n\n💰 Total: *{total_price}*\n💳 Pembayaran: *{payment_status}*\n📦 Status: *{status}*\n\n{status_note}',
  my_orders_message: '📦 *PESANAN SAYA*\n\n{orders}\n\nKetik *ORDER_STATUS <nomor>* untuk melihat detail.',
};

let remoteMessages: Partial<typeof defaults> = {};
let loadedAt = 0;

async function messages(): Promise<typeof defaults> {
  if (Date.now() - loadedAt > 30000) {
    try {
      remoteMessages = await apiService.get<Partial<typeof defaults>>('/api/bot-settings');
      loadedAt = Date.now();
    } catch {
      // Keep defaults when the settings endpoint is temporarily unavailable.
    }
  }
  return { ...defaults, ...remoteMessages };
}

function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

export const messageService = {
  async cartMenuMessage(): Promise<string> {
    return (await messages()).menu_message;
  },

  async cartHelpMessage(): Promise<string> {
    return (await messages()).help_message;
  },

  welcomeMessage(waName: string): string {
    return `👋 Halo ${waName}! Selamat datang di *${process.env.BOT_NAME || 'OrderBot'}* 🛒\n\nKami melayani pemesanan barang via WhatsApp.\nKetik *MENU* untuk melihat pilihan.\n\n⚡ Fitur:\n• PRODUCTS - Lihat produk\n• ORDER <nama> <jumlah> - Pesan barang\n• ORDER_STATUS <nomor> - Cek status\n• MY_ORDERS - Pesanan saya\n• HELP - Bantuan`;
  },

  menuMessage(): string {
    return `*📋 MENU UTAMA*\n\n1. *PRODUCTS* — Lihat daftar produk\n2. *ORDER <produk> <jumlah>* — Buat pesanan\n3. *ORDER_STATUS <nomor>* — Cek status\n4. *MY_ORDERS* — Lihat pesanan saya\n5. *CUSTOMER <nama> <alamat>* — Daftarkan alamat\n6. *HELP* — Lihat bantuan`;
  },

  async orderSuccessMessage(orderNumber: string, totalPrice: number): Promise<string> {
    const template = (await messages()).order_success_message;
    return render(template, { order_number: orderNumber, total_price: formatRupiah(totalPrice) });
  },

  async orderStatusMessage(order: any): Promise<string> {
    const template = (await messages()).order_status_message;
    return render(template, {
      order_number: String(order.order_number ?? ''),
      items: formatOrderItems(order.items),
      total_price: formatRupiah(Number(order.total_price ?? 0)),
      payment_status: capitalize(String(order.payment_status ?? '')),
      status: capitalize(String(order.status ?? '')),
      status_note: this.getStatusMessage(String(order.status ?? '')),
    });
  },

  async myOrdersMessage(orders: any[]): Promise<string> {
    const template = (await messages()).my_orders_message;
    const list = orders
      .map(
        (o: any) =>
          `🔢 *${o.order_number}*\n${formatOrderItems(o.items)}\n💰 Total: *${formatRupiah(Number(o.total_price ?? 0))}* | 💳 ${capitalize(String(o.payment_status ?? ''))} | 📦 ${capitalize(String(o.status ?? ''))}`
      )
      .join('\n\n━━━━━━━━━━━━\n\n');
    return render(template, { orders: list });
  },

  orderStatusMessageSync(status: string, orderNumber: string): string {
    return `📋 *Status Order ${orderNumber}*\n\nStatus: *${status.toUpperCase()}*\n\n${this.getStatusMessage(status)}`;
  },

  getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      pending: '⏳ Menunggu pembayaran',
      processing: '🔄 Order sedang diproses',
      shipped: '🚚 Pengiriman sedang dalam perjalanan',
      delivered: '✅ Pesanan telah diterima',
      cancelled: '❌ Order dibatalkan',
    };
    return messages[status] || 'Status tidak diketahui';
  },

  helpMessage(): string {
    return `*🔧 HELP / BANTUAN*\n\nKetik perintah berikut:\n• MENU — Tampilkan menu\n• PRODUCTS — Lihat produk\n• ORDER <nama> <jumlah> — Buat pesanan\n• ORDER_STATUS <nomor> — Cek status\n• MY_ORDERS — Pesanan saya\n• CANCEL <nomor> — Batalkan\n• CUSTOMER <nama> <alamat> — Daftar alamat\n• HELP — Bantuan ini\n\nFormat: ketik di chat ini, contoh: ORDER produk_A 3`;
  },
};

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatOrderItems(items: any[] | undefined): string {
  if (!items || items.length === 0) return '-';
  return items
    .map((item: any) => {
      const name = item.product?.name ?? 'Produk tidak tersedia';
      const subtotal = formatRupiah(Number(item.subtotal ?? 0));
      return `• ${name} x${item.quantity} = ${subtotal}`;
    })
    .join('\n');
}
