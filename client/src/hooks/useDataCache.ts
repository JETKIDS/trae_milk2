import { useState, useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface UseDataCacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number;
}

export const useDataCache = <T>(
  key: string,
  options: UseDataCacheOptions = {}
) => {
  const { ttl = 5 * 60 * 1000, maxSize = 100 } = options; // デフォルト5分
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const [cache, setCache] = useState<Map<string, CacheEntry<T>>>(new Map());

  const isExpired = useCallback((entry: CacheEntry<T>): boolean => {
    return Date.now() - entry.timestamp > entry.ttl;
  }, []);

  const cleanup = useCallback(() => {
    const now = Date.now();
    const newCache = new Map();
    
    cacheRef.current.forEach((v, k) => {
      if (now - v.timestamp <= v.ttl) {
        newCache.set(k, v);
      }
    });
    
    cacheRef.current = newCache;
    setCache(newCache);
  }, []);

  const get = useCallback((cacheKey: string): T | null => {
    const entry = cacheRef.current.get(cacheKey);
    if (!entry || isExpired(entry)) {
      return null;
    }
    return entry.data;
  }, [isExpired]);

  const set = useCallback((cacheKey: string, data: T, customTtl?: number): void => {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: customTtl || ttl
    };

    // サイズ制限チェック
    if (cacheRef.current.size >= maxSize) {
      cleanup();
    }

    cacheRef.current.set(cacheKey, entry);
    setCache(new Map(cacheRef.current));
  }, [ttl, maxSize, cleanup]);

  const invalidate = useCallback((cacheKey?: string): void => {
    if (cacheKey) {
      cacheRef.current.delete(cacheKey);
    } else {
      cacheRef.current.clear();
    }
    setCache(new Map(cacheRef.current));
  }, []);

  const getOrSet = useCallback(async (
    cacheKey: string,
    fetcher: () => Promise<T>,
    customTtl?: number
  ): Promise<T> => {
    const cached = get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    set(cacheKey, data, customTtl);
    return data;
  }, [get, set]);

  return {
    get,
    set,
    invalidate,
    getOrSet,
    cleanup,
    size: cache.size
  };
};
