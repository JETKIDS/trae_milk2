import axios from 'axios';

const API_BASE_URL = 'http://localhost:9000/api';

export interface DeliveryProduct {
  product_id: number;
  product_name: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
}

export interface DeliveryCustomer {
  customer_id: number;
  customer_name: string;
  address: string;
  phone: string;
  products: DeliveryProduct[];
}

export interface DeliverySummary {
  total_customers: number;
  total_quantity: number;
  total_amount: number;
}

export interface DailyDeliveryData {
  date: string;
  deliveries: DeliveryCustomer[];
  summary: DeliverySummary;
}

export const deliveryService = {
  // 日別配達データを取得
  getDailyDeliveries: async (date: string): Promise<DailyDeliveryData> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/delivery/daily/${date}`);
      return response.data;
    } catch (error) {
      console.error('配達データの取得に失敗しました:', error);
      throw error;
    }
  }
};