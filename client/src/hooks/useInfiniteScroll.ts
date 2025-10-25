import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

interface UseInfiniteScrollReturn {
  isFetching: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
  setHasMore: (hasMore: boolean) => void;
  setIsFetching: (isFetching: boolean) => void;
  setElementRef: (node: HTMLElement | null) => void;
}

export const useInfiniteScroll = (
  onLoadMore: () => Promise<void>,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn => {
  const {
    threshold = 0.1,
    rootMargin = '100px',
    enabled = true
  } = options;

  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const loadMore = useCallback(async () => {
    if (isFetching || !hasMore) return;

    try {
      setIsFetching(true);
      await onLoadMore();
    } catch (error) {
      console.error('Infinite scroll load more error:', error);
    } finally {
      setIsFetching(false);
    }
  }, [isFetching, hasMore, onLoadMore]);

  const reset = useCallback(() => {
    setIsFetching(false);
    setHasMore(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isFetching) {
          loadMore();
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observerRef.current = observer;

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enabled, hasMore, isFetching, loadMore, threshold, rootMargin]);

  const setElementRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    elementRef.current = node;

    if (node && enabled) {
      observerRef.current?.observe(node);
    }
  }, [enabled]);

  return {
    isFetching,
    hasMore,
    loadMore,
    reset,
    setHasMore,
    setIsFetching,
    setElementRef
  };
};
