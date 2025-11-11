import apiClient from '../utils/apiClient';

export type ChangeType = 'skip' | 'add' | 'modify';

export interface TemporaryChangePayload {
  customer_id: number;
  change_date: string; // YYYY-MM-DD
  change_type: ChangeType;
  product_id: number;
  quantity?: number | null;
  unit_price?: number | null;
  reason?: string | null;
}

export interface TemporaryChangeRow {
  id?: number;
  customer_id: number;
  change_date: string;
  change_type: ChangeType;
  product_id?: number;
  quantity?: number | null;
  unit_price?: number | null;
  reason?: string | null;
  created_at?: string;
}

export async function createTemporaryChange(payload: TemporaryChangePayload): Promise<number | undefined> {
  try {
    const res = await apiClient.post('/api/temporary-changes', payload);
    return res?.data?.id as number | undefined;
  } catch (error) {
    console.error('createTemporaryChange failed:', error);
    throw error;
  }
}

export async function updateTemporaryChange(id: number, payload: Partial<TemporaryChangePayload>): Promise<void> {
  try {
    await apiClient.put(`/api/temporary-changes/${id}`, payload);
  } catch (error) {
    console.error('updateTemporaryChange failed:', error);
    throw error;
  }
}

export async function deleteTemporaryChange(id: number): Promise<void> {
  try {
    await apiClient.delete(`/api/temporary-changes/${id}`);
  } catch (error) {
    console.error('deleteTemporaryChange failed:', error);
    throw error;
  }
}

export async function listCustomerTemporaryChangesForPeriod(customerId: number | string, start: string, end: string): Promise<TemporaryChangeRow[]> {
  try {
    const res = await apiClient.get(`/api/temporary-changes/customer/${customerId}/period/${start}/${end}`);
    return Array.isArray(res.data) ? (res.data as TemporaryChangeRow[]) : [];
  } catch (error) {
    console.error('listCustomerTemporaryChangesForPeriod failed:', error);
    throw error;
  }
}