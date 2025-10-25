// CustomerDetail関連の型定義を集約
export interface CalendarProduct {
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  amount: number;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  dayOfWeek: number; // 0..6
  isToday?: boolean;
  products: CalendarProduct[];
}

export interface DeliveryPattern {
  id?: number;
  customer_id: number;
  product_id: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  delivery_days: number[] | string;
  daily_quantities?: { [dayOfWeek: number]: number } | string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

export interface MonthDay {
  date: string;
  day: number;
  dayOfWeek: number;
  isToday: boolean;
}

export interface ProductMaster {
  product_name: string;
  sales_tax_type?: 'inclusive' | 'standard' | 'reduced' | string | null;
  purchase_tax_type?: 'inclusive' | 'standard' | 'reduced' | string | null;
  sales_tax_rate?: number | null;
}

export interface ProductCalendarData {
  productName: string;
  specification: string;
  dailyQuantities: { [date: string]: number };
}

export interface TemporaryChange {
  id?: number;
  customer_id: number;
  change_date: string;
  change_type: 'skip' | 'add' | 'modify';
  product_id?: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  reason?: string;
  created_at?: string;
}

export interface Customer {
  id: number;
  custom_id: string;
  customer_name: string;
  address: string;
  phone: string;
  course_id: number;
  course_name: string;
  contract_start_date: string;
}

export interface UndoAction {
  description: string;
  revert: () => Promise<void>;
}
