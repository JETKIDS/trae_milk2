import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

interface UseOptimizedDataOptions {
  cacheKey: string;
  ttl?: number; // Time to live in milliseconds
  retryCount?: number;
  retryDelay?: number;
}

interface UseOptimizedDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearCache: () => void;
}

// メモリキャッシュ
const memoryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();

export const useOptimizedData = <T>(
  url: string,
  options: UseOptimizedDataOptions
): UseOptimizedDataReturn<T> => {
  const { cacheKey, ttl = 5 * 60 * 1000, retryCount = 3, retryDelay = 1000 } = options;
  
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // キャッシュからデータを取得
  const getCachedData = useCallback((): T | null => {
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  }, [cacheKey, ttl]);

  // データをキャッシュに保存
  const setCachedData = useCallback((newData: T) => {
    memoryCache.set(cacheKey, {
      data: newData,
      timestamp: Date.now(),
      ttl
    });
  }, [cacheKey, ttl]);

  // キャッシュをクリア
  const clearCache = useCallback(() => {
    memoryCache.delete(cacheKey);
  }, [cacheKey]);

  // データ取得（リトライ機能付き）
  const fetchData = useCallback(async (retryAttempt = 0): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // キャッシュからデータを確認
      const cachedData = getCachedData();
      if (cachedData) {
        setData(cachedData);
        setLoading(false);
        return;
      }

      const response = await axios.get(url);
      const responseData = response.data;

      // データをキャッシュに保存
      setCachedData(responseData);
      setData(responseData);
    } catch (err: any) {
      console.error(`データ取得エラー (試行 ${retryAttempt + 1}/${retryCount + 1}):`, err);
      
      if (retryAttempt < retryCount) {
        // リトライ
        setTimeout(() => {
          fetchData(retryAttempt + 1);
        }, retryDelay * Math.pow(2, retryAttempt)); // 指数バックオフ
      } else {
        setError(err.message || 'データの取得に失敗しました');
      }
    } finally {
      setLoading(false);
    }
  }, [url, cacheKey, ttl, retryCount, retryDelay, getCachedData, setCachedData]);

  // データ再取得
  const refetch = useCallback(async () => {
    clearCache();
    await fetchData();
  }, [fetchData, clearCache]);

  // 初期化
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    clearCache
  };
};

// バッチデータ取得フック
export const useBatchData = <T>(
  urls: string[],
  options: UseOptimizedDataOptions
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBatchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const promises = urls.map(url => axios.get(url));
      const responses = await Promise.all(promises);
      const batchData = responses.map(response => response.data);

      setData(batchData);
    } catch (err: any) {
      console.error('バッチデータ取得エラー:', err);
      setError(err.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [urls]);

  useEffect(() => {
    fetchBatchData();
  }, [fetchBatchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchBatchData
  };
};

// デバウンス付き検索フック
export const useDebouncedSearch = <T>(
  searchFunction: (query: string) => Promise<T[]>,
  delay: number = 300
) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useMemo(
    () => {
      let timeoutId: NodeJS.Timeout;
      
      return (searchQuery: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          if (searchQuery.trim()) {
            try {
              setLoading(true);
              setError(null);
              const searchResults = await searchFunction(searchQuery);
              setResults(searchResults);
            } catch (err: any) {
              console.error('検索エラー:', err);
              setError(err.message || '検索に失敗しました');
            } finally {
              setLoading(false);
            }
          } else {
            setResults([]);
          }
        }, delay);
      };
    },
    [searchFunction, delay]
  );

  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    debouncedSearch(searchQuery);
  }, [debouncedSearch]);

  return {
    query,
    results,
    loading,
    error,
    search: handleSearch,
    clearResults: () => {
      setQuery('');
      setResults([]);
    }
  };
};

// 仮想化対応リストフック
export const useVirtualizedList = <T>(
  items: T[],
  itemHeight: number = 50,
  containerHeight: number = 400
) => {
  const [scrollTop, setScrollTop] = useState<number>(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      items.length
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    setScrollTop,
    visibleRange
  };
};

// メモ化された計算フック
export const useMemoizedCalculation = <T, R>(
  data: T[],
  calculationFunction: (items: T[]) => R,
  dependencies: any[] = []
) => {
  return useMemo(() => {
    return calculationFunction(data);
  }, [data, calculationFunction, ...dependencies]);
};

// パフォーマンス監視フック
export const usePerformanceMonitor = (componentName: string) => {
  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      if (renderTime > 100) { // 100ms以上の場合に警告
        console.warn(`${componentName} のレンダリング時間が長すぎます: ${renderTime.toFixed(2)}ms`);
      }
    };
  }, [componentName]);
};
