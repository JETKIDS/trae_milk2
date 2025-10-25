import { useState, useCallback } from 'react';
import { handleApiError, ApiError, isRetryableError } from '../utils/errorHandler';

interface UseErrorHandlerReturn {
  error: ApiError | null;
  setError: (error: ApiError | null) => void;
  handleError: (error: any) => void;
  clearError: () => void;
  retry: () => Promise<void>;
  isRetrying: boolean;
}

export const useErrorHandler = (
  onRetry?: () => Promise<void>
): UseErrorHandlerReturn => {
  const [error, setError] = useState<ApiError | null>(null);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const handleError = useCallback((error: any) => {
    const apiError = handleApiError(error);
    setError(apiError);
    console.error('Error handled:', apiError);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retry = useCallback(async () => {
    if (!onRetry || !error || !isRetryableError(error)) {
      return;
    }

    try {
      setIsRetrying(true);
      clearError();
      await onRetry();
    } catch (err) {
      handleError(err);
    } finally {
      setIsRetrying(false);
    }
  }, [error, onRetry, clearError, handleError]);

  return {
    error,
    setError,
    handleError,
    clearError,
    retry,
    isRetrying
  };
};
