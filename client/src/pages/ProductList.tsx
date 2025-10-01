import React, { useState, useEffect } from 'react';
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
import { Add as AddIcon, Edit as EditIcon, Search as SearchIcon } from '@mui/icons-material';
import axios from 'axios';

interface Product {
  id: number;
  custom_id?: string;
  product_name: string;
  manufacturer_name: string;
  unit_price: number;
  unit: string;
  description: string;
  category?: string;
}

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');

  useEffect(() => {
    const fetchProducts = async (): Promise<void> => {
      try {
        const params: any = {};
        if (searchId) params.searchId = searchId;
        if (searchName) params.searchName = searchName;
        
        const response = await axios.get('/api/products', { params });
        setProducts(response.data);
      } catch (error) {
        console.error('商品データの取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [searchId, searchName]);

  const handleSearchIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchId(event.target.value);
  };

  const handleSearchNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchName(event.target.value);
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          商品管理
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {/* TODO: 新規商品登録画面へ */}}
        >
          新規商品登録
        </Button>
      </Box>

      {/* 検索フィールド */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          検索条件
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="ID"
              placeholder="4桁IDで検索（先頭の0は省略可能）"
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
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="商品名"
              placeholder="商品名で検索"
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
        </Grid>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>商品名</TableCell>
              <TableCell>メーカー</TableCell>
              <TableCell align="right">単価</TableCell>
              <TableCell>単位</TableCell>
              <TableCell>説明</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product: Product) => (
              <TableRow key={product.id} hover>
                <TableCell>
                  <Chip 
                    label={product.custom_id || `#${product.id}`} 
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell>{product.product_name}</TableCell>
                <TableCell>{product.manufacturer_name}</TableCell>
                <TableCell align="right">¥{product.unit_price.toLocaleString()}</TableCell>
                <TableCell>{product.unit}</TableCell>
                <TableCell>{product.description || '-'}</TableCell>
                <TableCell>
                  <Button size="small" startIcon={<EditIcon />}>
                    編集
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {products.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body1" color="textSecondary">
            登録されている商品がありません。
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ProductList;