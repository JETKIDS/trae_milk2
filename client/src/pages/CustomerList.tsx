import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import axios from 'axios';
import CustomerForm from '../components/CustomerForm';

interface Customer {
  id: number;
  custom_id?: string;
  customer_name: string;
  yomi?: string;
  address: string;
  phone: string;
  course_name: string;
  contract_start_date: string;
}

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
  // ページング
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [total, setTotal] = useState(0);
  // コース折りたたみ状態
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openCustomerForm, setOpenCustomerForm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
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

        const response = await axios.get('/api/customers/paged', { params });
        const { items, total } = response.data;
        setCustomers(items || []);
        setTotal(total || 0);

        // 折りたたみ初期値（デフォルト閉）
        const nextOpen: Record<string, boolean> = {};
        (items || []).forEach((c: Customer) => {
          const key = c.course_name || '未設定';
          if (!(key in nextOpen)) nextOpen[key] = false;
        });
        setOpenGroups(nextOpen);
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchCustomers();
  }, [searchId, searchName, searchAddress, searchPhone, sortKey, page]);

  // 並び順のローカル保存
  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortKey);
    } catch (e) {
      // localStorageが使用不可の場合は何もしない
      console.warn('並び順の保存に失敗しました:', e);
    }
  }, [sortKey]);

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
    navigate(`/customers/${customerId}`);
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

        const response = await axios.get('/api/customers/paged', { params });
        const { items, total } = response.data;
        setCustomers(items || []);
        setTotal(total || 0);
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error);
      }
    };
    fetchCustomers();
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  // グルーピング
  const groups = customers.reduce((acc, c) => {
    const key = c.course_name || '未設定';
    (acc[key] ||= []).push(c);
    return acc;
  }, {} as Record<string, Customer[]>);

  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ja'));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 検索や並び替え時はページを1に戻す
  useEffect(() => {
    setPage(1);
  }, [searchId, searchName, searchAddress, searchPhone, sortKey]);

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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>顧客名</TableCell>
              <TableCell>よみがな</TableCell>
              <TableCell>住所</TableCell>
              <TableCell>電話番号</TableCell>
              <TableCell>配達コース</TableCell>
              <TableCell>契約開始日</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
      <TableBody>
        {groupKeys.map((key) => {
          const isOpen = !!openGroups[key];
          const items = groups[key];

          return (
            <React.Fragment key={`grp-${key}`}>
              {/* グループヘッダ行 */}
              <TableRow>
                <TableCell colSpan={8}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Button
                        size="small"
                        startIcon={isOpen ? <span>&#9650;</span> : <span>&#9660;</span>}
                        onClick={() => setOpenGroups((prev) => ({ ...prev, [key]: !isOpen }))}
                      >
                        {key}
                      </Button>
                      <Chip label={`${items.length}件`} size="small" sx={{ ml: 1 }} />
                    </Box>
                    <Typography variant="caption">ページ {page} / {pageCount}</Typography>
                  </Box>
                </TableCell>
              </TableRow>

              {/* グループ本文（折りたたみ） */}
              {isOpen &&
                items.map((customer: Customer) => (
                  <TableRow key={customer.id} hover>
                    <TableCell>
                      <Chip
                        label={customer.custom_id || `#${customer.id}`}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{customer.customer_name}</TableCell>
                    <TableCell>{customer.yomi || '-'}</TableCell>
                    <TableCell>{customer.address}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>
                      <Chip
                        label={customer.course_name || '未設定'}
                        color={customer.course_name ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{customer.contract_start_date}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleViewCustomer(customer.id)}
                      >
                        詳細
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </React.Fragment>
          );
        })}
      </TableBody>
        </Table>
      </TableContainer>

      {customers.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body1" color="textSecondary">
            登録されている顧客がありません。
          </Typography>
        </Box>
      )}

      {/* ページャ */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
        <Button
          size="small"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          sx={{ mr: 1 }}
        >
          前へ
        </Button>
        <Typography variant="body2" sx={{ mx: 1 }}>
          {page} / {pageCount}
        </Typography>
        <Button
          size="small"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          sx={{ ml: 1 }}
        >
          次へ
        </Button>
      </Box>

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