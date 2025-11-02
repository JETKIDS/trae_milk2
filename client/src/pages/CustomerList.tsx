import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Paper,
  Button,
  Box,
  Chip,
  TextField,
  InputAdornment,
  Grid,
  MenuItem,
} from '@mui/material';
import { Add as AddIcon, Visibility as VisibilityIcon, Search as SearchIcon } from '@mui/icons-material';
import apiClient from '../utils/apiClient';
import { FixedSizeList, ListOnItemsRenderedProps } from 'react-window';
import CustomerForm from '../components/CustomerForm';
import { pad7 } from '../utils/id';
import { openCustomerStandalone } from '../utils/window';
import { Customer } from '../types/customer';

// 顧客タイプは共通定義を使用します

const CustomerList: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  // 並び順の保持（画面切替後も維持）
  const SORT_STORAGE_KEY = 'customers.sortKey';
  const [sortKey, setSortKey] = useState<'id' | 'yomi' | 'course'>(
    () => {
      const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
      return saved === 'id' || saved === 'yomi' || saved === 'course' ? saved : 'yomi';
    }
  );
  // ページング（無限スクロール用）
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [total, setTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [openCustomerForm, setOpenCustomerForm] = useState(false);
  const navigate = useNavigate();

  // 初回ロード & フィルター変更時の再ロード（ページを1に戻す）
  useEffect(() => {
    const fetchFirstPage = async (): Promise<void> => {
      try {
        setLoading(true);
        const params: any = {};
        if (searchId) params.searchId = searchId;
        if (searchName) params.searchName = searchName;
        if (searchAddress) params.searchAddress = searchAddress;
        if (searchPhone) params.searchPhone = searchPhone;
        if (sortKey) params.sort = sortKey;
        params.page = 1;
        params.pageSize = PAGE_SIZE;

        const response = await apiClient.get('/api/customers/paged', { params });
        const { items, total } = response.data;
        setCustomers(items || []);
        setTotal(total || 0);
        setPage(1);
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFirstPage();
  }, [searchId, searchName, searchAddress, searchPhone, sortKey]);

  // 並び順のローカル保存
  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortKey);
    } catch (e) {
      // localStorageが使用不可の場合は何もしない
      console.warn('並び順の保存に失敗しました:', e);
    }
  }, [sortKey]);

  // 検索や並び替え時はページを1に戻す（常にトップレベルで宣言）
  useEffect(() => {
    setPage(1);
  }, [searchId, searchName, searchAddress, searchPhone, sortKey]);

  const handleSearchIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchId(event.target.value);
  };

  const handleSearchNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchName(event.target.value);
  };

  const handleSearchAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchAddress(event.target.value);
  };

  const handleSearchPhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchPhone(event.target.value);
  };

  const handleViewCustomer = (customerId: number) => {
    openCustomerStandalone(customerId);
  };

  const handleOpenCustomerForm = () => {
    setOpenCustomerForm(true);
  };

  const handleCloseCustomerForm = () => {
    setOpenCustomerForm(false);
  };

  const handleCustomerSaved = () => {
    // 顧客データを再取得
    const fetchCustomers = async (): Promise<void> => {
      try {
        const params: any = {};
        if (searchId) params.searchId = searchId;
        if (searchName) params.searchName = searchName;
        if (searchAddress) params.searchAddress = searchAddress;
        if (searchPhone) params.searchPhone = searchPhone;
        if (sortKey) params.sort = sortKey;
        params.page = page;
        params.pageSize = PAGE_SIZE;

        const response = await apiClient.get('/api/customers/paged', { params });
        const { items, total } = response.data;
        setCustomers(items || []);
        setTotal(total || 0);
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error);
      }
  };
  fetchCustomers();
  };

  // 追加ページ読み込み（無限スクロール）
  const loadMore = async () => {
    if (isLoadingMore) return;
    if (customers.length >= total) return; // 全件読み込み済み
    try {
      setIsLoadingMore(true);
      const nextPage = page + 1;
      const params: any = {};
      if (searchId) params.searchId = searchId;
      if (searchName) params.searchName = searchName;
      if (searchAddress) params.searchAddress = searchAddress;
      if (searchPhone) params.searchPhone = searchPhone;
      if (sortKey) params.sort = sortKey;
      params.page = nextPage;
      params.pageSize = PAGE_SIZE;

      const response = await apiClient.get('/api/customers/paged', { params });
      const { items } = response.data;
      setCustomers((prev) => [...prev, ...(items || [])]);
      setPage(nextPage);
    } catch (error) {
      console.error('追加読み込みに失敗しました:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 無限スクロール用の表示件数（末尾にローディング行を追加する場合がある）
  const itemCount = customers.length + (customers.length < total ? 1 : 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          顧客管理
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCustomerForm}
        >
          新規顧客登録
        </Button>
      </Box>

      {/* 検索・並び順フィールド */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          検索条件・並び順
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="ID"
              placeholder="IDで検索（先頭の0は省略可能）"
              value={searchId}
              onChange={handleSearchIdChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="顧客名"
              placeholder="ひらがな（よみがな）でも検索できます"
              value={searchName}
              onChange={handleSearchNameChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="住所"
              placeholder="住所で検索"
              value={searchAddress}
              onChange={handleSearchAddressChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="電話番号"
              placeholder="電話番号で検索"
              value={searchPhone}
              onChange={handleSearchPhoneChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              select
              label="並び順"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as 'id' | 'yomi' | 'course')}
              helperText="ID順 / フリガナ順 / コース順"
            >
              <MenuItem value="id">ID順</MenuItem>
              <MenuItem value="yomi">フリガナ順</MenuItem>
              <MenuItem value="course">コース順</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Box>

      <Paper sx={{ height: 600 }}>
        <FixedSizeList
          height={600}
          width="100%"
          itemSize={64}
          itemCount={itemCount}
          onItemsRendered={(info: ListOnItemsRenderedProps) => {
            const nearEnd = info.visibleStopIndex >= customers.length - 1;
            if (nearEnd) {
              // 末尾まで到達したら次ページを読み込む
              loadMore();
            }
          }}
        >
          {({ index, style }) => {
            if (index >= customers.length) {
              // ローディング行
              return (
                <Box style={style} sx={{ px: 2, display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {isLoadingMore ? '読み込み中…' : customers.length < total ? 'さらに読み込む…' : '全件表示済み'}
                  </Typography>
                </Box>
              );
            }

            const customer = customers[index];
            return (
              <Box
                style={style}
                sx={{
                  px: 2,
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 150px 1fr 140px 140px 100px',
                  alignItems: 'center',
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: '#f9f9f9' },
                }}
                onClick={() => handleViewCustomer(customer.id!)}
              >
                <Box>
                  <Chip label={pad7(customer.custom_id)} variant="outlined" size="small" />
                </Box>
                <Box>
                  <Typography variant="body2">{customer.customer_name}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">{customer.yomi || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2">{customer.address}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2">{customer.phone}</Typography>
                </Box>
                <Box>
                  <Chip label={customer.course_name || '未設定'} color={customer.course_name ? 'primary' : 'default'} size="small" />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">{customer.contract_start_date}</Typography>
                  <Button
                    size="small"
                    startIcon={<VisibilityIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewCustomer(customer.id!);
                    }}
                  >
                    詳細
                  </Button>
                </Box>
              </Box>
            );
          }}
        </FixedSizeList>
      </Paper>

      {customers.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body1" color="textSecondary">
            登録されている顧客がありません。
          </Typography>
        </Box>
      )}

      {/* 新規顧客登録フォーム */}
      <CustomerForm
        open={openCustomerForm}
        onClose={handleCloseCustomerForm}
        onSave={handleCustomerSaved}
        isEdit={false}
      />
    </Box>
  );
};

export default CustomerList;