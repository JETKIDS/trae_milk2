import React, { useState, useEffect, useCallback } from 'react';
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
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Search as SearchIcon } from '@mui/icons-material';
import apiClient from '../utils/apiClient';
import ProductForm from '../components/ProductForm';

interface Product {
  id?: number;
  custom_id?: string;
  product_name: string;
  product_name_short?: string;
  manufacturer_id: number;
  manufacturer_name?: string;
  order_code?: string;
  jan_code?: string;
  sort_order?: number;
  unit_price: number;
  description?: string;
  include_in_invoice: boolean; // 請求書記載チェック
  sales_tax_type: 'inclusive' | 'standard' | 'reduced'; // 税込み、標準10%、軽減8%
  purchase_tax_type: 'inclusive' | 'standard' | 'reduced'; // 税込み、標準10%、軽減8%
}

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');
  const [openProductForm, setOpenProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  // ページング
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [total, setTotal] = useState(0);

  const fetchProducts = useCallback(async (): Promise<void> => {
    try {
      const params: any = { page, pageSize: PAGE_SIZE };
      if (searchId) params.searchId = searchId;
      if (searchName) params.searchName = searchName;
      const response = await apiClient.get('/api/products/paged', { params });
      const { items, total } = response.data || {};
      setProducts(items || []);
      setTotal(total || 0);
    } catch (error) {
      console.error('商品データの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  }, [searchId, searchName, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // 検索条件変更時は1ページ目へ
  useEffect(() => {
    setPage(1);
  }, [searchId, searchName]);

  const handleSearchIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchId(event.target.value);
  };

  const handleSearchNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchName(event.target.value);
  };

  const handleOpenProductForm = () => {
    setEditingProduct(null);
    setOpenProductForm(true);
  };

  const handleCloseProductForm = () => {
    setOpenProductForm(false);
    setEditingProduct(null);
  };

  const handleSaveProduct = async () => {
    await fetchProducts();
    setOpenProductForm(false);
    setEditingProduct(null);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setOpenProductForm(true);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!product.id) return;
    const ok = window.confirm(`商品「${product.product_name}」を削除します。よろしいですか？`);
    if (!ok) return;
    try {
      await apiClient.delete(`/api/products/${product.id}`);
      await fetchProducts();
    } catch (error: any) {
      console.error('商品削除に失敗しました:', error);
      alert(error?.response?.data?.error || '商品削除に失敗しました');
    }
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
          onClick={handleOpenProductForm}
          data-testid="btn-open-add-product"
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
                <TableCell>{product.description || '-'}</TableCell>
                <TableCell>
                  <Button 
                    size="small" 
                    startIcon={<EditIcon />}
                    onClick={() => handleEditProduct(product)}
                  >
                    編集
                  </Button>
                  <Button 
                    size="small" 
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => handleDeleteProduct(product)}
                    sx={{ ml: 1 }}
                  >
                    削除
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

      {/* ページネーション */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Typography variant="body2" sx={{ mr: 2 }}>
          全{total}件
        </Typography>
        <Button
          size="small"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          sx={{ mr: 1 }}
        >
          前へ
        </Button>
        <Button
          size="small"
          disabled={(page * PAGE_SIZE) >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          次へ
        </Button>
      </Box>

      <ProductForm
        open={openProductForm}
        onClose={handleCloseProductForm}
        onSave={handleSaveProduct}
        product={editingProduct}
      />
    </Box>
  );
};

export default ProductList;