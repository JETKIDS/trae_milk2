import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Pagination,
} from '@mui/material';
import {
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { FixedSizeList as VirtualList } from 'react-window';
import { useOptimizedData, useDebouncedSearch, useVirtualizedList } from '../hooks/useOptimizedData';
import { Customer } from '../types/customerDetail';

interface OptimizedCustomerListProps {
  onCustomerSelect: (customer: Customer) => void;
  onCustomerEdit: (customer: Customer) => void;
  onCustomerDelete: (customer: Customer) => void;
  height?: number;
  itemHeight?: number;
}

interface CustomerListItemProps {
  customer: Customer;
  index: number;
  style: React.CSSProperties;
  onSelect: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}

const CustomerListItem: React.FC<CustomerListItemProps> = ({
  customer,
  index,
  style,
  onSelect,
  onEdit,
  onDelete
}) => {
  const handleSelect = useCallback(() => {
    onSelect(customer);
  }, [customer, onSelect]);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(customer);
  }, [customer, onEdit]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(customer);
  }, [customer, onDelete]);

  return (
    <div style={style}>
      <Paper
        sx={{
          m: 1,
          p: 2,
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: '#f5f5f5',
            boxShadow: 2,
          },
        }}
        onClick={handleSelect}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="div">
              {customer.customer_name}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {customer.address}
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Chip
                label={`ID: ${customer.custom_id}`}
                size="small"
                color="primary"
                variant="outlined"
              />
              {customer.phone && (
                <Chip
                  label={`📞 ${customer.phone}`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              size="small"
              onClick={handleSelect}
              color="primary"
            >
              <ViewIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleEdit}
              color="secondary"
            >
              <EditIcon />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleDelete}
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </Paper>
    </div>
  );
};

const OptimizedCustomerList: React.FC<OptimizedCustomerListProps> = ({
  onCustomerSelect,
  onCustomerEdit,
  onCustomerDelete,
  height = 600,
  itemHeight = 120
}) => {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');

  // 顧客データの取得（最適化済み）
  const {
    data: customers,
    loading,
    error,
    refetch
  } = useOptimizedData<Customer[]>(
    '/api/customers',
    {
      cacheKey: 'customers-list',
      ttl: 5 * 60 * 1000, // 5分間キャッシュ
      retryCount: 3,
      retryDelay: 1000
    }
  );

  // 検索機能（デバウンス付き）
  const searchCustomers = useCallback(async (query: string): Promise<Customer[]> => {
    if (!customers) return [];
    
    const filtered = customers.filter(customer =>
      customer.customer_name.toLowerCase().includes(query.toLowerCase()) ||
      customer.address.toLowerCase().includes(query.toLowerCase()) ||
      customer.custom_id.includes(query)
    );
    
    return filtered;
  }, [customers]);

  const {
    results: searchResults,
    loading: searchLoading,
    search: handleSearch,
    clearResults
  } = useDebouncedSearch(searchCustomers, 300);

  // 表示するデータの決定
  const displayData = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    return customers || [];
  }, [searchQuery, searchResults, customers]);

  // ページネーション
  const paginatedData = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return displayData.slice(startIndex, endIndex);
  }, [displayData, page, pageSize]);

  const totalPages = Math.ceil(displayData.length / pageSize);

  // 検索ハンドラー
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    
    if (query.trim()) {
      handleSearch(query);
    } else {
      clearResults();
    }
  }, [handleSearch, clearResults]);

  // ページ変更ハンドラー
  const handlePageChange = useCallback((event: React.ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
  }, []);

  // エラー表示
  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" action={
          <IconButton color="inherit" size="small" onClick={refetch}>
            再試行
          </IconButton>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  // ローディング表示
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 検索バー */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          placeholder="顧客名、住所、IDで検索..."
          value={searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        {searchLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" sx={{ ml: 1 }}>
              検索中...
            </Typography>
          </Box>
        )}
      </Box>

      {/* 顧客リスト */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {paginatedData.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="textSecondary">
              {searchQuery ? '検索条件に一致する顧客が見つかりません' : '顧客が登録されていません'}
            </Typography>
          </Box>
        ) : (
          <VirtualList
            height={height}
            itemCount={paginatedData.length}
            itemSize={itemHeight}
            itemData={{
              customers: paginatedData,
              onSelect: onCustomerSelect,
              onEdit: onCustomerEdit,
              onDelete: onCustomerDelete
            }}
          >
            {({ index, style, data }) => (
              <CustomerListItem
                customer={data.customers[index]}
                index={index}
                style={style}
                onSelect={data.onSelect}
                onEdit={data.onEdit}
                onDelete={data.onDelete}
              />
            )}
          </VirtualList>
        )}
      </Box>

      {/* ページネーション */}
      {totalPages > 1 && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* 統計情報 */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', backgroundColor: '#f5f5f5' }}>
        <Typography variant="body2" color="textSecondary">
          表示中: {paginatedData.length}件 / 全{displayData.length}件
          {searchQuery && ` (検索: "${searchQuery}")`}
        </Typography>
      </Box>
    </Box>
  );
};

export default OptimizedCustomerList;