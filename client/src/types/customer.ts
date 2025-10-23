export type BillingMethod = 'collection' | 'debit';

export interface Customer {
  id?: number; // optional for create forms
  custom_id?: string;
  customer_name: string;
  yomi?: string;
  address: string;
  phone: string;
  email?: string;
  course_id?: number;
  course_name?: string;
  contract_start_date?: string;
  notes?: string;
  billing_method?: BillingMethod;
  rounding_enabled?: number; // 1 or 0
  delivery_order?: number;
}