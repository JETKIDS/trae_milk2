export type PaymentMethod = 'collection' | 'debit';

export interface PaymentRecord {
  id: number;
  customer_id: number;
  year: number;
  month: number;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  created_at?: string;
}

export interface ArInvoiceStatus {
  confirmed: boolean;
  amount?: number;
  rounding_enabled?: boolean;
  confirmed_at?: string | null;
}