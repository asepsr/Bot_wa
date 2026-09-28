import { formatRupiah } from './constants.js';

export function formatOrderMessage(order: any): string {
  let msg = `📋 *ORDER CONFIRMATION*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔢 Order ID: *${order.order_number}*\n`;
  msg += `👤 Customer: ${order.customer?.wa_name || 'N/A'}\n`;
  msg += `📅 Date: ${new Date(order.ordered_at).toLocaleString('id-ID')}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;
  
  msg += `*Items:*\n`;
  order.items?.forEach((item: any) => {
    msg += `  📦 ${item.product_name} × ${item.quantity} = ${formatRupiah(item.subtotal)}\n`;
  });
  
  msg += `\n💰 Total: *${formatRupiah(order.total_price)}*\n`;
  msg += `📦 Status: *${order.status}*\n`;
  msg += `💳 Payment: *${order.payment_status}*\n`;
  
  return msg;
}

export function formatProductList(products: any[]): string {
  let msg = `📦 *AVAILABLE PRODUCTS*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  products.forEach((p, i) => {
    msg += `${i + 1}. *${p.name}*\n`;
    msg += `   💰 ${formatRupiah(p.price)} | 📦 Stock: ${p.stock}\n`;
    msg += `   ${p.category || ''}\n\n`;
  });
  return msg;
}
