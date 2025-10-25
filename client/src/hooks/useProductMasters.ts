import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ProductMaster } from '../types/customerDetail';

interface UseProductMastersReturn {
  productMapByName: Record<string, ProductMaster>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useProductMasters = (): UseProductMastersReturn => {
  const [productMapByName, setProductMapByName] = useState<Record<string, ProductMaster>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await axios.get('/api/products');
      const masters: ProductMaster[] = (res.data || []).map((p: any) => ({
        product_name: p.product_name,
        sales_tax_type: p.sales_tax_type,
        purchase_tax_type: p.purchase_tax_type,
        sales_tax_rate: typeof p.sales_tax_rate === 'number' ? p.sales_tax_rate : null,
      }));
      
      const byName: Record<string, ProductMaster> = {};
      masters.forEach((m) => { byName[m.product_name] = m; });
      setProductMapByName(byName);
    } catch (err: any) {
      console.error('商品マスタ取得エラー', err);
      setError(err?.response?.data?.error || '商品マスタの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return {
    productMapByName,
    loading,
    error,
    refetch: fetchProducts
  };
};
