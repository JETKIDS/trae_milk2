import { useState, useEffect, useCallback } from 'react';
import apiClient from '../utils/apiClient';
import { Customer, DeliveryPattern, ProductMaster } from '../types/customerDetail';
import { useErrorHandler } from './useErrorHandler';
import { ApiError } from '../utils/errorHandler';

interface UseCustomerDataReturn {
  customer: Customer | null;
  patterns: DeliveryPattern[];
  loading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
}

export const useCustomerData = (customerId: string | undefined): UseCustomerDataReturn => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const { error, handleError, clearError, retry } = useErrorHandler();

  const fetchCustomerData = useCallback(async () => {
    if (!customerId) {
      handleError(new Error('顧客IDが指定されていません'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      clearError();
      
    const res = await apiClient.get(`/api/customers/${customerId}`);
      const data = res.data || {};
      
      if (data.customer) {
        setCustomer(data.customer);
        setPatterns(data.patterns || []);
      } else {
        setCustomer(data);
        setPatterns(data.patterns || []);
      }
    } catch (err: any) {
      console.error('顧客データ取得エラー', err);
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [customerId, handleError, clearError]);

  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  return {
    customer,
    patterns,
    loading,
    error,
    refetch: fetchCustomerData
  };
};
