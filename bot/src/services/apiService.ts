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

export const apiService = {
  async post<T>(endpoint: string, data: any): Promise<T> {
    try {
      const response = await apiClient.post(endpoint, data);
      return response.data;
    } catch (error: any) {
      logger.error(`API POST ${endpoint}:`, error.message || error);
      throw error;
    }
  },

  async get<T>(endpoint: string): Promise<T> {
    try {
      const response = await apiClient.get<T>(endpoint);
      return response.data;
    } catch (error: any) {
      logger.error(`API GET ${endpoint}:`, error.message || error);
      throw error;
    }
  },

  async getImage(url: string): Promise<Buffer> {
    try {
      const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error(`Image GET ${url}:`, error.message || error);
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
      logger.error(`API POST ${endpoint}:`, error.message || error);
      throw error;
    }
  },
};
