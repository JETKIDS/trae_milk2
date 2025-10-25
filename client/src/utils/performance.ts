// パフォーマンス測定と最適化のユーティリティ

export const measurePerformance = <T extends (...args: any[]) => any>(
  fn: T,
  name?: string
): T => {
  return ((...args: any[]) => {
    const start = performance.now();
    const result = fn(...args);
    const end = performance.now();
    
    if (name) {
      console.log(`${name} took ${end - start} milliseconds`);
    }
    
    return result;
  }) as T;
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T => {
  let timeout: NodeJS.Timeout;
  
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
};

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T => {
  let inThrottle: boolean;
  
  return ((...args: any[]) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }) as T;
};

export const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T => {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

export const batchUpdates = (updates: (() => void)[]): void => {
  // React 18の自動バッチングを活用
  updates.forEach(update => update());
};

export const createVirtualizedData = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) => {
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = 0;
  const endIndex = Math.min(startIndex + visibleCount, items.length);
  
  return {
    visibleItems: items.slice(startIndex, endIndex),
    totalHeight: items.length * itemHeight,
    startIndex,
    endIndex
  };
};

export const optimizeListRendering = <T>(
  items: T[],
  renderItem: (item: T, index: number) => React.ReactNode,
  itemHeight: number = 50
): React.ReactNode[] => {
  // 仮想化されたレンダリング
  const visibleCount = Math.min(20, items.length); // 最大20アイテムを表示
  const visibleItems = items.slice(0, visibleCount);
  
  return visibleItems.map((item, index) => renderItem(item, index));
};
