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
        
        const response = await axios.get('/api/customers', { params });
        setCustomers(response.data);
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [searchId, searchName, searchAddress, searchPhone]);

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
        
        const response = await axios.get('/api/customers', { params });
        setCustomers(response.data);
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error);
      }
    };
    fetchCustomers();
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

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

      {/* 検索フィールド */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          検索条件
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
            {customers.map((customer: Customer) => (
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