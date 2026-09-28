import { sanitizeInput, validateOrderInput } from '../utils/validators.js';
import { COMMANDS } from '../utils/constants.js';

export function parseCommand(text: string): { command: string; args: string[] } | null {
  const trimmed = text.trim();
  
  // Handle /COMMAND format
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toUpperCase();
    const args = parts.slice(1);
    return { command, args };
  }
  
  // Handle plain text commands like "MENU", "PRODUCTS", "HELP"
  const plainCommand = trimmed.toUpperCase().trim();
  const validPlainCommands = ['MENU', 'PRODUCT', 'PRODUCTS', 'ORDER', 'HELP', 'MY_ORDERS', 'CUSTOMER', 'CANCEL', 'ADMIN', 'ORDER_STATUS'];
  if (validPlainCommands.includes(plainCommand)) {
    const parts = plainCommand.split(/\s+/);
    const command = parts[0] === 'PRODUCT' ? 'PRODUCTS' : parts[0];
    const args = parts.slice(1);
    return { command, args };
  }
  
  return null;
}

export function parseTextCommand(text: string): { command: string; productName?: string; quantity?: number; args?: string[] } | null {
  const trimmed = text.trim();
  
  // Try to parse ORDER command from text like "ORDER produk_A 3"
  const orderMatch = trimmed.match(/^ORDER\s+(.+?)\s+(\d+)$/i);
  if (orderMatch) {
    return { command: 'ORDER', productName: orderMatch[1], quantity: parseInt(orderMatch[2]) };
  }
  
  const statusMatch = trimmed.match(/^ORDER_STATUS\s+(\S+)/i);
  if (statusMatch) {
    return { command: 'ORDER_STATUS', productName: undefined, quantity: undefined, args: [statusMatch[1]] };
  }
  
  // Check for plain text commands
  const plainMatch = trimmed.match(/^(MENU|PRODUCT|PRODUCTS|ORDER|HELP|MY_ORDERS|CUSTOMER|CANCEL|ADMIN)$/i);
  if (plainMatch) {
    const command = plainMatch[1].toUpperCase();
    return { command: command === 'PRODUCT' ? 'PRODUCTS' : command };
  }
  
  return null;
}
