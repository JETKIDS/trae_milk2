// エラーハンドリングのユーティリティ
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
}

export class AppError extends Error {
  public code: string;
  public status?: number;
  public details?: any;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', status?: number, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const handleApiError = (error: any): ApiError => {
  console.error('API Error:', error);

  // ネットワークエラー
  if (!error.response) {
    return {
      message: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
      code: 'NETWORK_ERROR',
      status: 0
    };
  }

  // HTTPステータスコード別の処理
  const status = error.response.status;
  const data = error.response.data;

  switch (status) {
    case 400:
      return {
        message: data?.error || 'リクエストが無効です。',
        code: 'BAD_REQUEST',
        status: 400,
        details: data
      };
    case 401:
      return {
        message: '認証が必要です。ログインし直してください。',
        code: 'UNAUTHORIZED',
        status: 401
      };
    case 403:
      return {
        message: 'この操作を実行する権限がありません。',
        code: 'FORBIDDEN',
        status: 403
      };
    case 404:
      return {
        message: 'リソースが見つかりません。',
        code: 'NOT_FOUND',
        status: 404
      };
    case 409:
      return {
        message: data?.error || 'データの競合が発生しました。',
        code: 'CONFLICT',
        status: 409,
        details: data
      };
    case 422:
      return {
        message: data?.error || '入力データに問題があります。',
        code: 'VALIDATION_ERROR',
        status: 422,
        details: data
      };
    case 500:
      return {
        message: 'サーバー内部エラーが発生しました。しばらく時間をおいて再試行してください。',
        code: 'INTERNAL_SERVER_ERROR',
        status: 500
      };
    default:
      return {
        message: data?.error || '予期しないエラーが発生しました。',
        code: 'UNKNOWN_ERROR',
        status: status,
        details: data
      };
  }
};

export const handleValidationError = (error: any): string => {
  if (error.details && Array.isArray(error.details)) {
    return error.details.map((detail: any) => detail.message).join(', ');
  }
  return error.message || '入力データに問題があります。';
};

export const isRetryableError = (error: ApiError): boolean => {
  const retryableCodes = ['NETWORK_ERROR', 'INTERNAL_SERVER_ERROR'];
  const retryableStatuses = [0, 500, 502, 503, 504];
  
  return Boolean(error.code && retryableCodes.includes(error.code)) || 
         Boolean(error.status && retryableStatuses.includes(error.status));
};

export const getErrorMessage = (error: any): string => {
  if (error instanceof AppError) {
    return error.message;
  }
  
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return '予期しないエラーが発生しました。';
};
