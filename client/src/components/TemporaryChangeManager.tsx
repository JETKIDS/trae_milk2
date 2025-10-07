import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Alert,
  Snackbar,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface Product {
  id: number;
  product_name: string;
  manufacturer_name: string;
  unit: string;
  unit_price: number;
}

interface TemporaryChange {
  id?: number;
  customer_id: number;
  change_date: string;
  change_type: 'skip' | 'add' | 'modify';
  product_id?: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  reason?: string;
  created_at?: string;
}

interface TemporaryChangeManagerProps {
  customerId: number;
  changes: TemporaryChange[];
  onChangesUpdate: () => void;
}

export interface TemporaryChangeManagerHandle {
  openAddForDate: (date: string) => void;
}

const TemporaryChangeManager = forwardRef<TemporaryChangeManagerHandle, TemporaryChangeManagerProps>(({ 
  customerId,
  changes,
  onChangesUpdate,
}, ref) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingChange, setEditingChange] = useState<TemporaryChange | null>(null);
  const [formData, setFormData] = useState<Partial<TemporaryChange>>({
    customer_id: customerId,
    change_date: new Date().toISOString().split('T')[0],
    change_type: 'skip',
    quantity: 1,
    unit_price: 0,
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/products');
      setProducts(response.data);
    } catch (error) {
      console.error('商品データの取得に失敗しました:', error);
    }
  };

  const handleOpenDialog = (change?: TemporaryChange) => {
    if (change) {
      setEditingChange(change);
      setFormData(change);
    } else {
      setEditingChange(null);
      setFormData({
        customer_id: customerId,
        change_date: new Date().toISOString().split('T')[0],
        change_type: 'skip',
        quantity: 1,
        unit_price: 0,
      });
    }
    setOpenDialog(true);
  };

  // 外部から「臨時商品追加」ダイアログを開くためのハンドル
  useImperativeHandle(ref, () => ({
    openAddForDate: (date: string) => {
      setEditingChange(null);
      setFormData({
        customer_id: customerId,
        change_date: date,
        change_type: 'add',
        quantity: 1,
        unit_price: 0,
      });
      setOpenDialog(true);
    },
  }));

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingChange(null);
  };

  const handleProductChange = (productId: number) => {
    const selectedProduct = products.find(p => p.id === productId);
    if (selectedProduct) {
      setFormData({
        ...formData,
        product_id: productId,
        unit_price: selectedProduct.unit_price,
      });
    }
  };

  const handleChangeTypeChange = (changeType: 'skip' | 'add' | 'modify') => {
    setFormData({
      ...formData,
      change_type: changeType,
      product_id: changeType === 'skip' ? undefined : formData.product_id,
      quantity: changeType === 'skip' ? undefined : formData.quantity || 1,
      unit_price: changeType === 'skip' ? undefined : formData.unit_price || 0,
    });
  };

  const handleSave = async () => {
    try {
      if (!formData.change_date) {
        setSnackbar({
          open: true,
          message: '変更日は必須項目です。',
          severity: 'error',
        });
        return;
      }

      if (formData.change_type !== 'skip' && (!formData.product_id || !formData.quantity)) {
        setSnackbar({
          open: true,
          message: '商品追加・変更の場合は商品と数量が必須です。',
          severity: 'error',
        });
        return;
      }

      if (editingChange) {
        await axios.put(`/api/temporary-changes/${editingChange.id}`, formData);
        setSnackbar({
          open: true,
          message: '臨時変更を更新しました。',
          severity: 'success',
        });
      } else {
        await axios.post('/api/temporary-changes', formData);
        setSnackbar({
          open: true,
          message: '臨時変更を追加しました。',
          severity: 'success',
        });
      }

      handleCloseDialog();
      onChangesUpdate();
    } catch (error) {
      console.error('臨時変更の保存に失敗しました:', error);
      setSnackbar({
        open: true,
        message: '臨時変更の保存に失敗しました。',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (changeId: number) => {
    if (!window.confirm('この臨時変更を削除しますか？')) {
      return;
    }

    try {
      await axios.delete(`/api/temporary-changes/${changeId}`);
      setSnackbar({
        open: true,
        message: '臨時変更を削除しました。',
        severity: 'success',
      });
      onChangesUpdate();
    } catch (error) {
      console.error('臨時変更の削除に失敗しました:', error);
      setSnackbar({
        open: true,
        message: '臨時変更の削除に失敗しました。',
        severity: 'error',
      });
    }
  };

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case 'skip':
        return '配達停止';
      case 'add':
        return '商品追加';
      case 'modify':
        return '数量変更';
      default:
        return type;
    }
  };

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'skip':
        return 'error';
      case 'add':
        return 'success';
      case 'modify':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">臨時変更管理</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            臨時変更追加
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>変更日</TableCell>
                <TableCell>変更種別</TableCell>
                <TableCell>商品名</TableCell>
                <TableCell>メーカー</TableCell>
                <TableCell align="center">数量</TableCell>
                <TableCell align="right">単価</TableCell>
                <TableCell>理由</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {changes.map((change) => (
                <TableRow key={change.id}>
                  <TableCell>{change.change_date}</TableCell>
                  <TableCell>
                    <Chip
                      label={getChangeTypeLabel(change.change_type)}
                      color={getChangeTypeColor(change.change_type) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{change.product_name || '-'}</TableCell>
                  <TableCell>{change.manufacturer_name || '-'}</TableCell>
                  <TableCell align="center">
                    {change.quantity ? `${change.quantity}${change.unit}` : '-'}
                  </TableCell>
                  <TableCell align="right">
                    {change.unit_price ? `¥${change.unit_price.toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell>{change.reason || '-'}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(change)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(change.id!)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {changes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="textSecondary">
                      臨時変更が設定されていません。
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* 臨時変更編集ダイアログ */}
        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            {editingChange ? '臨時変更編集' : '臨時変更追加'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="変更日"
                  type="date"
                  value={formData.change_date || ''}
                  onChange={(e) => setFormData({ ...formData, change_date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormLabel component="legend">変更種別</FormLabel>
                <RadioGroup
                  row
                  value={formData.change_type}
                  onChange={(e) => handleChangeTypeChange(e.target.value as 'skip' | 'add' | 'modify')}
                >
                  <FormControlLabel value="skip" control={<Radio />} label="配達停止" />
                  <FormControlLabel value="add" control={<Radio />} label="商品追加" />
                  <FormControlLabel value="modify" control={<Radio />} label="数量変更" />
                </RadioGroup>
              </Grid>
              
              {formData.change_type !== 'skip' && (
                <>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>商品</InputLabel>
                      <Select
                        value={formData.product_id || ''}
                        onChange={(e) => handleProductChange(Number(e.target.value))}
                        label="商品"
                      >
                        {products.map((product) => (
                          <MenuItem key={product.id} value={product.id}>
                            {product.manufacturer_name} - {product.product_name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      fullWidth
                      label="数量"
                      type="number"
                      value={formData.quantity || ''}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                      inputProps={{ min: 1 }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      fullWidth
                      label="単価"
                      type="number"
                      value={formData.unit_price || ''}
                      onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })}
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                </>
              )}
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="理由（任意）"
                  multiline
                  rows={3}
                  value={formData.reason || ''}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} startIcon={<CancelIcon />}>
              キャンセル
            </Button>
            <Button onClick={handleSave} variant="contained" startIcon={<SaveIcon />}>
              保存
            </Button>
          </DialogActions>
        </Dialog>

        {/* スナックバー */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
});

export default TemporaryChangeManager;