import React from 'react';
import { Alert, AlertTitle, Button, Box } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { ApiError } from '../utils/errorHandler';

interface ErrorAlertProps {
  error: ApiError | null;
  onRetry?: () => void;
  onClose?: () => void;
  isRetrying?: boolean;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  onRetry,
  onClose,
  isRetrying = false
}) => {
  if (!error) return null;

  const getSeverity = (error: ApiError) => {
    if (error.status && error.status >= 500) return 'error';
    if (error.status && error.status >= 400) return 'warning';
    return 'info';
  };

  const getTitle = (error: ApiError) => {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'ネットワークエラー';
      case 'UNAUTHORIZED':
        return '認証エラー';
      case 'FORBIDDEN':
        return '権限エラー';
      case 'NOT_FOUND':
        return 'リソースが見つかりません';
      case 'CONFLICT':
        return 'データ競合';
      case 'VALIDATION_ERROR':
        return '入力エラー';
      case 'INTERNAL_SERVER_ERROR':
        return 'サーバーエラー';
      default:
        return 'エラーが発生しました';
    }
  };

  return (
    <Alert 
      severity={getSeverity(error)} 
      action={
        <Box sx={{ display: 'flex', gap: 1 }}>
          {onRetry && (
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
              disabled={isRetrying}
            >
              {isRetrying ? '再試行中...' : '再試行'}
            </Button>
          )}
          {onClose && (
            <Button size="small" onClick={onClose}>
              閉じる
            </Button>
          )}
        </Box>
      }
      sx={{ mb: 2 }}
    >
      <AlertTitle>{getTitle(error)}</AlertTitle>
      {error.message}
    </Alert>
  );
};

export default ErrorAlert;
