import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
  Divider,
  InputAdornment,
} from '@mui/material';
import apiClient from '../utils/apiClient';
// 日本語入力の拡張（ローマ字変換）は撤去し、標準のTextFieldに戻します

interface Product {
  id?: number;
  custom_id?: string;
  product_name: string;
  product_name_short?: string;
  manufacturer_id: number;
  order_code?: string;
  jan_code?: string;
  sort_order?: number;
  sort_type?: 'id' | 'order_code'; // ID順または発注コード順
  unit_price: number;
  purchase_price?: number; // メーカーからの仕入れ価格
  unit?: string; // 単位（本、個、パックなど）
  description?: string;
  include_in_invoice: boolean; // 請求書記載チェック
  // 既存のタイプ表現は維持しつつ、レートを明示的に保持します
  sales_tax_type: 'inclusive' | 'standard' | 'reduced'; // 税込み、標準10%、軽減8%
  sales_tax_rate?: number; // 8 or 10（特に税込み時に使用）
  purchase_tax_type: 'inclusive' | 'standard' | 'reduced'; // 税込み、標準10%、軽減8%
  purchase_tax_rate?: number; // 8 or 10（特に税込み時に使用）
}

interface Manufacturer {
  id: number;
  manufacturer_name: string;
}

interface ProductFormProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  product?: Product | null;
}

const ProductForm: React.FC<ProductFormProps> = ({ open, onClose, onSave, product }) => {
  const [formData, setFormData] = useState<Product>({
    product_name: '',
    product_name_short: '',
    manufacturer_id: 0,
    order_code: '',
    jan_code: '',
    sort_order: 0,
    sort_type: 'id', // デフォルト：ID順
    unit_price: 0,
    purchase_price: 0,
    unit: '本', // デフォルト：本
    description: '',
    include_in_invoice: false,
    sales_tax_type: 'inclusive', // デフォルト：税込み
    sales_tax_rate: 10, // デフォルト：内税10％
    purchase_tax_type: 'reduced', // デフォルト：外税8％
    purchase_tax_rate: 8,
  });

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (open) {
      fetchManufacturers();
      if (product) {
        setFormData({
          ...product,
          sales_tax_type: product.sales_tax_type || 'inclusive',
          sales_tax_rate: product.sales_tax_rate ?? (
            product.sales_tax_type === 'inclusive' ? 10 : (product.sales_tax_type === 'standard' ? 10 : 8)
          ),
          purchase_tax_type: product.purchase_tax_type || 'reduced',
          purchase_tax_rate: product.purchase_tax_rate ?? (
            product.purchase_tax_type === 'inclusive' ? 10 : (product.purchase_tax_type === 'standard' ? 10 : 8)
          ),
          include_in_invoice: product.include_in_invoice || false,
          sort_type: product.sort_type || 'id',
          purchase_price: product.purchase_price || 0,
          unit: product.unit || '本',
        });
      } else {
        // 新規作成時は次の利用可能custom_idを自動設定
        fetchNextAvailableId().then(nextCustomId => {
          setFormData({
            custom_id: nextCustomId,
            product_name: '',
            product_name_short: '',
            manufacturer_id: 0,
            order_code: '',
            jan_code: '',
            sort_order: 0,
            sort_type: 'id', // デフォルト：ID順
            unit_price: 0,
            purchase_price: 0,
            unit: '本', // デフォルト：本
            description: '',
            include_in_invoice: false,
            sales_tax_type: 'inclusive', // デフォルト：税込み
            sales_tax_rate: 10, // デフォルト：内税10％
            purchase_tax_type: 'reduced', // デフォルト：外税8％
            purchase_tax_rate: 8,
          });
        });
      }
      setErrors({});
    }
  }, [open, product]);

  const fetchManufacturers = async () => {
    try {
      const response = await apiClient.get('/api/masters/manufacturers');
      if (response.data && Array.isArray(response.data)) {
        // データの安全性チェック
        const validManufacturers = response.data.filter(manufacturer => 
          manufacturer && 
          typeof manufacturer.id === 'number' && 
          typeof manufacturer.manufacturer_name === 'string'
        );
        setManufacturers(validManufacturers);
      } else {
        console.error('メーカーデータの形式が不正です:', response.data);
        setManufacturers([]);
      }
    } catch (error) {
      console.error('メーカー取得エラー:', error);
      setManufacturers([]);
    }
  };

  const fetchNextAvailableId = async (): Promise<string> => {
    try {
      const response = await apiClient.get('/api/products');
      const products = response.data;
      
      // 4桁数値形式のcustom_idを取得
      const numericCustomIds = products
        .map((p: Product) => p.custom_id)
        .filter((customId: string) => customId && /^[0-9]{4}$/.test(customId))
        .map((customId: string) => parseInt(customId, 10));
      
      // 最大値を取得して次のIDを生成
      const maxId = numericCustomIds.length > 0 ? Math.max(...numericCustomIds) : 0;
      const nextId = maxId + 1;
      const paddedId = nextId.toString().padStart(4, '0');
      
      return paddedId;
    } catch (error) {
      console.error('ID取得エラー:', error);
      return '0001'; // エラー時はデフォルトで0001を返す
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.product_name.trim()) {
      newErrors.product_name = '商品名は必須です';
    }

    if (!formData.manufacturer_id || formData.manufacturer_id === 0) {
      newErrors.manufacturer_id = 'メーカーを選択してください';
    }

    // 単価は0やマイナスも許可。未入力や非数値のみエラー
    if (formData.unit_price === undefined || formData.unit_price === null || Number.isNaN(formData.unit_price as any)) {
      newErrors.unit_price = '単価は数値で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      if (product?.id) {
        await apiClient.put(`/api/products/${product.id}`, formData);
      } else {
        // 新規作成時はidを除外してサーバーに送信
        const { id, ...dataWithoutId } = formData;
        await apiClient.post('/api/products', dataWithoutId);
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('商品保存エラー:', error);
    }
  };

  // 4択の消費税設定（販売・仕入れ）をUIと内部フィールドにマッピング
  type TaxOption = 'inclusive8' | 'inclusive10' | 'exclusive8' | 'exclusive10';

  const getSalesTaxOption = (): TaxOption => {
    if (formData.sales_tax_type === 'inclusive') {
      return formData.sales_tax_rate === 8 ? 'inclusive8' : 'inclusive10';
    }
    if (formData.sales_tax_type === 'standard') return 'exclusive10';
    return 'exclusive8';
  };

  const setSalesTaxByOption = (opt: TaxOption) => {
    switch (opt) {
      case 'inclusive8':
        setFormData({ ...formData, sales_tax_type: 'inclusive', sales_tax_rate: 8 });
        break;
      case 'inclusive10':
        setFormData({ ...formData, sales_tax_type: 'inclusive', sales_tax_rate: 10 });
        break;
      case 'exclusive8':
        setFormData({ ...formData, sales_tax_type: 'reduced', sales_tax_rate: 8 });
        break;
      case 'exclusive10':
        setFormData({ ...formData, sales_tax_type: 'standard', sales_tax_rate: 10 });
        break;
    }
  };

  const getPurchaseTaxOption = (): TaxOption => {
    if (formData.purchase_tax_type === 'inclusive') {
      return formData.purchase_tax_rate === 8 ? 'inclusive8' : 'inclusive10';
    }
    if (formData.purchase_tax_type === 'standard') return 'exclusive10';
    return 'exclusive8';
  };

  const setPurchaseTaxByOption = (opt: TaxOption) => {
    switch (opt) {
      case 'inclusive8':
        setFormData({ ...formData, purchase_tax_type: 'inclusive', purchase_tax_rate: 8 });
        break;
      case 'inclusive10':
        setFormData({ ...formData, purchase_tax_type: 'inclusive', purchase_tax_rate: 10 });
        break;
      case 'exclusive8':
        setFormData({ ...formData, purchase_tax_type: 'reduced', purchase_tax_rate: 8 });
        break;
      case 'exclusive10':
        setFormData({ ...formData, purchase_tax_type: 'standard', purchase_tax_rate: 10 });
        break;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {product ? '商品編集' : '新規商品登録'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={3}>
            {/* ID入力欄 */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="商品ID"
                value={formData.custom_id || ''}
                onChange={(e) => setFormData({ ...formData, custom_id: e.target.value })}
                helperText="4桁の数値形式（例：0001）。未使用IDが自動表示されます。"
                inputProps={{ maxLength: 4, pattern: '[0-9]{4}' }}
              />
            </Grid>

            {/* 基本情報 */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                基本情報
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                required
                label="商品名"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                error={!!errors.product_name}
                helperText={errors.product_name}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="略称"
                value={formData.product_name_short || ''}
                onChange={(e) => setFormData({ ...formData, product_name_short: e.target.value })}
                helperText="商品名の短縮版（任意）"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth required error={!!errors.manufacturer_id}>
                <InputLabel>メーカー</InputLabel>
                <Select
                  value={formData.manufacturer_id || ''}
                  onChange={(e) => setFormData({ ...formData, manufacturer_id: Number(e.target.value) })}
                  label="メーカー"
                >
                  <MenuItem value={0}>メーカーを選択してください</MenuItem>
                  {manufacturers && manufacturers.length > 0 && manufacturers.map((manufacturer) => (
                    manufacturer && manufacturer.id && manufacturer.manufacturer_name ? (
                      <MenuItem key={manufacturer.id} value={manufacturer.id}>
                        {manufacturer.manufacturer_name}
                      </MenuItem>
                    ) : null
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="発注用CD"
                value={formData.order_code || ''}
                onChange={(e) => setFormData({ ...formData, order_code: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="JANコード"
                value={formData.jan_code || ''}
                onChange={(e) => setFormData({ ...formData, jan_code: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="並び順"
                type="number"
                value={formData.sort_order || ''}
                onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>並び順タイプ</InputLabel>
                <Select
                  value={formData.sort_type || 'id'}
                  onChange={(e) => setFormData({ ...formData, sort_type: e.target.value as 'id' | 'order_code' })}
                  label="並び順タイプ"
                >
                  <MenuItem value="id">ID順</MenuItem>
                  <MenuItem value="order_code">発注コード順</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* 価格・単位セクション */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                価格・単位
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                required
                label="単価"
                type="number"
                value={formData.unit_price ?? ''}
                onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })}
                InputProps={{
                  endAdornment: <InputAdornment position="end">円</InputAdornment>,
                }}
                error={!!errors.unit_price}
                helperText={errors.unit_price}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="仕入れ価格"
                type="number"
                value={formData.purchase_price || ''}
                onChange={(e) => setFormData({ ...formData, purchase_price: Number(e.target.value) })}
                InputProps={{
                  endAdornment: <InputAdornment position="end">円</InputAdornment>,
                }}
                helperText="メーカーからの仕入れ価格"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>単位</InputLabel>
                <Select
                  value={formData.unit || '本'}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  label="単位"
                >
                  <MenuItem value="本">本</MenuItem>
                  <MenuItem value="個">個</MenuItem>
                  <MenuItem value="パック">パック</MenuItem>
                  <MenuItem value="袋">袋</MenuItem>
                  <MenuItem value="箱">箱</MenuItem>
                  <MenuItem value="缶">缶</MenuItem>
                  <MenuItem value="瓶">瓶</MenuItem>
                  <MenuItem value="L">L</MenuItem>
                  <MenuItem value="ml">ml</MenuItem>
                  <MenuItem value="kg">kg</MenuItem>
                  <MenuItem value="g">g</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* 設定オプション */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                設定オプション
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.include_in_invoice}
                    onChange={(e) => setFormData({ ...formData, include_in_invoice: e.target.checked })}
                  />
                }
                label="請求書に記載する"
              />
            </Grid>

            {/* 消費税設定 */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                消費税設定
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>販売価格の消費税</InputLabel>
                <Select
                  label="販売価格の消費税"
                  value={getSalesTaxOption()}
                  onChange={(e) => setSalesTaxByOption(e.target.value as TaxOption)}
                >
                  <MenuItem value="inclusive8">内税8％</MenuItem>
                  <MenuItem value="inclusive10">内税10％</MenuItem>
                  <MenuItem value="exclusive8">外税8％</MenuItem>
                  <MenuItem value="exclusive10">外税10％</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>仕入価格の消費税</InputLabel>
                <Select
                  label="仕入価格の消費税"
                  value={getPurchaseTaxOption()}
                  onChange={(e) => setPurchaseTaxByOption(e.target.value as TaxOption)}
                >
                  <MenuItem value="inclusive8">内税8％</MenuItem>
                  <MenuItem value="inclusive10">内税10％</MenuItem>
                  <MenuItem value="exclusive8">外税8％</MenuItem>
                  <MenuItem value="exclusive10">外税10％</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="説明"
                multiline
                rows={3}
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSubmit} variant="contained">
          {product ? '更新' : '登録'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProductForm;