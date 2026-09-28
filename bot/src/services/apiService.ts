import axios from 'axios';
import { config } from '../config/index.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const apiClient = axios.create({
  baseURL: config.apiUrl,
  headers: { 'Content-Type': 'application/json', 'X-Bot-API-Key': config.apiKey },
});

function describeError(error: any): string {
  const status = error?.response?.status;
  const body =
    typeof error?.response?.data === 'string'
      ? error.response.data.slice(0, 200)
      : JSON.stringify(error?.response?.data ?? '').slice(0, 200);
  return `status=${status ?? '?'} code=${error?.code ?? '?'} msg=${error?.message ?? '?'} body=${body}`;
}

export const apiService = {
  async post<T>(endpoint: string, data: any): Promise<T> {
    try {
      const response = await apiClient.post(endpoint, data);
      return response.data;
    } catch (error: any) {
      logger.error(`API POST ${endpoint}: ${describeError(error)}`);
      throw error;
    }
  },

  async get<T>(endpoint: string): Promise<T> {
    try {
      const response = await apiClient.get<T>(endpoint);
      return response.data;
    } catch (error: any) {
      logger.error(`API GET ${endpoint}: ${describeError(error)}`);
      throw error;
    }
  },

  async getImage(url: string): Promise<Buffer> {
    try {
      const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error(`Image GET ${url}: ${describeError(error)}`);
      throw error;
    }
  },

  async postWithAuth<T>(endpoint: string, data: any, token: string): Promise<T> {
    try {
      const response = await apiClient.post(endpoint, data, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return response.data;
    } catch (error: any) {
      logger.error(`API POST ${endpoint}: ${describeError(error)}`);
      throw error;
    }
  },
};
