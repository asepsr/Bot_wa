import { parseCommand, parseTextCommand } from './commandParser.js';
import { apiService } from '../services/apiService.js';
import { messageService } from '../services/messageService.js';
import {
  buildListMenu,
  buildQuickReply,
  cartConfirmQuickReply,
  checkoutCta,
} from '../services/interactiveService.js';
import type { proto } from '@whiskeysockets/baileys';
import { config } from '../config/index.js';
import { validateWaId, sanitizeInput } from '../utils/validators.js';
import { formatRupiah } from '../utils/constants.js';
import winston from 'winston';

type CartItem = { productId: number; name: string; price: number; quantity: number };
type CartState = { step: 'product' | 'quantity' | 'confirm'; cart: CartItem[]; selectedProduct?: CartItem };
export type InteractiveResponse = {
  interactive: proto.IMessage;
  fallbackText: string;
  imageUrl?: string;
  imageCaption?: string;
};
export type MessageResponse =
  | string
  | { text: string; imageUrl?: string; imageCaption?: string }
  | InteractiveResponse;

export function isInteractiveResponse(r: MessageResponse): r is InteractiveResponse {
  return typeof r === 'object' && 'interactive' in r;
}

/** Ambil teks polos untuk mode webhook (/bot/webhook & /send hanya teks). */
export function toPlainText(r: MessageResponse): string {
  if (typeof r === 'string') return r;
  if (isInteractiveResponse(r)) return r.fallbackText;
  return r.text;
}

const carts = new Map<string, CartState>();

function formatProductList(products: any[]): string {
  let msg = '📦 *DAFTAR PRODUK*\n━━━━━━━━━━━━━━━━━━\n';
  products.forEach((p: any) => {
    msg += `*Kode: ${p.id}* - *${p.name}*\n`;
    msg += `   💰 ${formatRupiah(p.price)} | 📦 Stock: ${p.stock}\n`;
    msg += `   ${p.category || ''}\n\n`;
  });
  return msg;
}

const logger = winston.createLogger({ level: 'info', format: winston.format.combine(winston.format.timestamp(), winston.format.json()), transports: [new winston.transports.Console()] });

export async function handleMessage(waId: string, waName: string, text: string): Promise<MessageResponse> {
  try {
    const input = text.trim();
    const upper = input.toUpperCase();
    const cartState = carts.get(waId);
    if (cartState && upper !== 'CANCEL') {
      return handleCartInput(waId, waName, input, cartState);
    }

    // Tap row list produk tanpa state cart: langsung masuk ke langkah jumlah.
    // Row id dari list dikirim sebagai "<id>" / "PRODUCT_<id>" / "ORDER_<id>".
    const directProductId = extractProductId(input);
    if (directProductId) {
      return startCartWithProduct(waId, directProductId);
    }
    if (upper === 'LANJUT' || upper === 'CHECKOUT') {
      return 'Keranjang kosong. Ketik *ORDER* untuk mulai belanja.';
    }

    // Check if it's a command
    const parsed = parseCommand(text) || parseTextCommand(text);
    
    if (!parsed) {
      return `Pesan tidak dikenali. Ketik *HELP* untuk bantuan.`;
    }
    
    const command = parsed.command;
    const args = parsed.args || [];
    
    switch (command) {
      case 'MENU': {
        const menuText = await messageService.cartMenuMessage();
        return menuText;
      }
       
      case 'PRODUCTS':
        return handleProducts(args);
       
      case 'ORDER':
        return handleOrderStart(waId, args);
 
      case 'CANCEL':
        carts.delete(waId);
        return 'Keranjang dibatalkan.';
      
      case 'ORDER_STATUS':
        return handleOrderStatus(waId, args);
      
      case 'MY_ORDERS':
        return handleMyOrders(waId);
      
      case 'CUSTOMER':
        return handleCustomer(waId, waName, args);
      
      case 'HELP': {
        const helpText = await messageService.cartHelpMessage();
        return {
          interactive: buildQuickReply(
            helpText,
            [
              { id: 'PRODUCTS', displayText: '📦 Produk' },
              { id: 'ORDER', displayText: '🛒 Order' },
              { id: 'MENU', displayText: '📋 Menu' },
            ],
            'OrderBot'
          ),
          fallbackText: `${helpText}\n\nKetik PRODUCTS / ORDER / MENU`,
        };
      }
      
      case 'ADMIN':
        return '🔒 Fitur admin memerlukan login. Hubungi admin untuk akses.';
      
      default:
        return `❌ Perintah "${command}" tidak dikenali. Ketik *HELP* untuk bantuan.`;
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    return '❌ Terjadi kesalahan. Silakan coba lagi.';
  }
}

async function handleProducts(args: string[]): Promise<MessageResponse> {
  try {
    const category = args[0] || '';
    const endpoint = category ? `/api/products?category=${category}` : '/api/products';
    const response = await apiService.get<any>(endpoint);
    const products = response.data || response;
    const list = Array.isArray(products) ? products : [];
    if (list.length === 0) return '📭 Produk belum tersedia.';
    const body = `${formatProductList(list)}Tap tombol di bawah untuk pilih cepat, atau ketik *kode produk*.`;
    return {
      interactive: buildListMenu(
        body,
        'Pilih Produk',
        [
          {
            title: 'Katalog',
            rows: list.slice(0, 10).map((p: any) => ({
              id: String(p.id),
              title: String(p.name).slice(0, 24) || `Produk ${p.id}`,
              description: `${formatRupiah(Number(p.price ?? 0))} | Stok: ${p.stock ?? '-'}`.slice(0, 72),
            })),
          },
        ],
        'Ketuk untuk memilih',
        'DAFTAR PRODUK'
      ),
      fallbackText: `${formatProductList(list)}Ketik *ORDER* untuk mulai memilih produk.`,
    };
  } catch (error) {
    return '❌ Gagal memuat daftar produk.';
  }
}

/** Mulai flow ORDER: langsung tampilkan list produk agar bisa tap (List Menu Button). */
async function handleOrderStart(waId: string, _args: string[]): Promise<MessageResponse> {
  carts.set(waId, { step: 'product', cart: [] });
  try {
    const response = await apiService.get<any>('/api/products');
    const products = response.data || response;
    const list = Array.isArray(products) ? products : [];
    if (list.length > 0) {
      const body = 'Silakan pilih produk dari daftar, atau ketik *kode produk*. Ketik *CANCEL* untuk membatalkan.';
      return {
        interactive: buildListMenu(
          body,
          'Pilih Produk',
          [
            {
              title: 'Katalog',
              rows: list.slice(0, 10).map((p: any) => ({
                id: String(p.id),
                title: String(p.name).slice(0, 24) || `Produk ${p.id}`,
                description: `${formatRupiah(Number(p.price ?? 0))} | Stok: ${p.stock ?? '-'}`.slice(0, 72),
              })),
            },
          ],
          'Tap untuk pilih cepat'
        ),
        fallbackText: 'Ketik *kode produk* yang ingin dipesan. Ketik *PRODUCT* untuk melihat daftar produk atau *CANCEL* untuk membatalkan.',
      };
    }
  } catch {
    // fallback ke teks di bawah
  }
  return 'Ketik *kode produk* yang ingin dipesan. Ketik *PRODUCT* untuk melihat daftar produk atau *CANCEL* untuk membatalkan.';
}

/** Row id list / quick reply bisa berupa "12", "PRODUCT_12", "ORDER_12". */
function extractProductId(input: string): number | null {
  const m = input.trim().match(/^(?:PRODUCT_|ORDER_)?(\d+)$/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

async function startCartWithProduct(waId: string, productId: number): Promise<MessageResponse> {
  try {
    const product = await apiService.get<any>(`/api/products/${productId}`);
    if (!product.is_active || product.stock < 1) {
      return 'Produk tidak tersedia. Ketik *PRODUCT* untuk melihat daftar.';
    }
    carts.set(waId, {
      step: 'quantity',
      cart: [],
      selectedProduct: {
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: 0,
      },
    });
    return `*${product.name}* tersedia. Mau berapa pcs?`;
  } catch {
    return 'Kode produk tidak ditemukan. Ketik *PRODUCT* untuk melihat daftar.';
  }
}

async function handleCartInput(waId: string, waName: string, input: string, state: CartState): Promise<MessageResponse> {
  if (state.step === 'product') {
    const productId = extractProductId(input);
    if (!productId) {
      return 'Kode produk harus berupa angka. Ketik *PRODUCT* untuk melihat daftar.';
    }

    try {
      const product = await apiService.get<any>(`/api/products/${productId}`);
      if (!product.is_active || product.stock < 1) {
        return 'Produk tidak tersedia. Pilih kode produk lain.';
      }
      state.selectedProduct = { productId: product.id, name: product.name, price: Number(product.price), quantity: 0 };
      state.step = 'quantity';
      return `*${product.name}* tersedia. Mau berapa pcs?`;
    } catch {
      return 'Kode produk tidak ditemukan. Ketik *PRODUCT* untuk melihat daftar.';
    }
  }

  if (state.step === 'quantity') {
    const quantity = Number(input);
    if (!Number.isInteger(quantity) || quantity < 1 || !state.selectedProduct) {
      return 'Jumlah harus berupa angka minimal 1. Mau berapa pcs?';
    }
    state.cart.push({ ...state.selectedProduct, quantity });
    state.selectedProduct = undefined;
    state.step = 'confirm';
    const cartText = `${formatCart(state.cart)}\nPilih langkah berikutnya.`;
    return cartConfirmQuickReply(cartText);
  }

  if (input.toUpperCase() === 'LANJUT') {
    state.step = 'product';
    return 'Ketik *kode produk* berikutnya.';
  }

  if (input.toUpperCase() !== 'CHECKOUT') {
    const cartText = `${formatCart(state.cart)}\nPilih langkah berikutnya.`;
    return cartConfirmQuickReply(cartText);
  }

  try {
    const response = await apiService.post<any>('/api/orders', {
      wa_id: waId,
      wa_name: waName,
      items: state.cart.map(({ productId, quantity }) => ({ product_id: productId, quantity })),
    });
    const order = response.data || response;
    carts.delete(waId);
    const paymentMessage = order.qris_url
      ? '\n\nSilakan scan QRIS berikut dan bayar tepat sesuai total invoice. Setelah membayar, kirim bukti pembayaran ke chat ini.'
      : '\n\nQRIS belum tersedia. Hubungi admin untuk mendapatkan instruksi pembayaran, lalu kirim bukti pembayaran ke chat ini.';
    const checkoutMessage = `${await messageService.orderSuccessMessage(order.order_number, order.total_price)}${paymentMessage}`;
    // 3. CTA Button untuk pembayaran (link QRIS + telepon admin)
    const cta = checkoutCta(checkoutMessage, order.qris_url);
    if (cta) {
      return {
        ...cta,
        imageUrl: order.qris_url || undefined,
        imageCaption: cta.fallbackText,
      };
    }
    return {
      text: order.qris_url ? '' : checkoutMessage,
      imageUrl: order.qris_url || undefined,
      imageCaption: checkoutMessage,
    };
  } catch (error) {
    return '❌ Gagal checkout. Stok mungkin berubah. Ketik *CHECKOUT* untuk mencoba lagi atau *CANCEL* untuk membatalkan.';
  }
}

function formatCart(cart: CartItem[]): string {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const items = cart.map((item) => `• ${item.name} x${item.quantity} = ${formatRupiah(item.price * item.quantity)}`).join('\n');
  return `🛒 *KERANJANG*\n${items}\n\nTotal sementara: *${formatRupiah(total)}*`;
}

async function handleOrderStatus(waId: string, args: string[]): Promise<string> {
  if (!args[0]) return '❌ Masukkan nomor pesanan. Contoh: ORDER_STATUS ORD-20260918-0001';
  try {
    const response = await apiService.get<any>(`/api/orders/${args[0]}`);
    const order = response.data || response;
    if (order.customer?.wa_id && order.customer.wa_id !== waId) {
      return '❌ Pesanan tersebut bukan milik Anda.';
    }
    return await messageService.orderStatusMessage(order);
  } catch (error) {
    return '❌ Pesanan tidak ditemukan. Periksa kembali nomor pesanan Anda.';
  }
}

async function handleMyOrders(waId: string): Promise<string> {
  try {
    const response = await apiService.get<any>(`/api/customers/${waId}/orders`);
    const orders = response.data || response;
    if (!orders || orders.length === 0) return '📭 Belum ada pesanan atas nama Anda. Ketik *ORDER* untuk mulai belanja.';
    return await messageService.myOrdersMessage(orders);
  } catch (error) {
    return '❌ Gagal memuat pesanan. Silakan coba lagi.';
  }
}

async function handleCustomer(waId: string, waName: string, args: string[]): Promise<string> {
  if (args.length < 1) return '❌ Gunakan: CUSTOMER <nama> <alamat>';
  try {
    const address = args.slice(1).join(' ');
    await apiService.post<any>('/api/customers', { wa_id: waId, wa_name: waName, address });
    return `✅ Alamat tersimpan! ${args[0]}, ${address}`;
  } catch (error) {
    return '❌ Gagal menyimpan alamat.';
  }
}
