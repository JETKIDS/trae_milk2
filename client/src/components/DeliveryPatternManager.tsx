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
  ToggleButton,
  ToggleButtonGroup,
  FormHelperText,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
  CalendarToday as CalendarTodayIcon,
} from '@mui/icons-material';
import axios from 'axios';

interface Product {
  id: number;
  product_name: string;
  manufacturer_name: string;
  unit: string;
  unit_price: number;
  include_in_invoice?: boolean | number; // 請求書に掲載する現行商品フラグ
}

interface DeliveryPattern {
  id?: number;
  customer_id: number;
  product_id: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity: number; // 後方互換性のため残す
  unit_price: number;
  delivery_days: number[];
  daily_quantities?: { [dayOfWeek: number]: number }; // 曜日ごとの数量 (0=日曜, 1=月曜, ...)
  start_date: string;
  end_date?: string;
  is_active: boolean;
}

interface DeliveryPatternManagerProps {
  customerId: number;
  patterns: DeliveryPattern[];
  onPatternsChange: () => void;
  onTemporaryChangesUpdate?: () => void;
  onRecordUndo?: (action: { description: string; revert: () => Promise<void> } | { description: string; revert: () => Promise<void> }[]) => void;
  readOnly?: boolean;
}

export interface DeliveryPatternManagerHandle {
  // 指定パターンの編集ダイアログを開く（defaultStartDate を指定可能）
  openForPattern: (pattern?: DeliveryPattern, defaultStartDate?: string) => void;
}

const DeliveryPatternManager = forwardRef<DeliveryPatternManagerHandle, DeliveryPatternManagerProps>(({ 
  customerId,
  patterns,
  onPatternsChange,
  onTemporaryChangesUpdate,
  onRecordUndo,
  readOnly,
}, ref) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPattern, setEditingPattern] = useState<DeliveryPattern | null>(null);
  const [isTemporaryMode, setIsTemporaryMode] = useState(false);
  const [temporaryDate, setTemporaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [temporaryQuantity, setTemporaryQuantity] = useState(1);
  const [formData, setFormData] = useState<Partial<DeliveryPattern>>({
    customer_id: customerId,
    product_id: 0,
    quantity: 1,
    unit_price: 0,
    delivery_days: [],
    daily_quantities: {},
    start_date: new Date().toISOString().split('T')[0],
    is_active: true,
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  // 単価入力は文字列で保持し、保存時に数値へ変換（NaN防止）
  const [unitPriceInput, setUnitPriceInput] = useState<string>('');
  // メーカー絞り込み（空文字は全メーカー）
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('');
  const manufacturerNames = React.useMemo(
    () => Array.from(new Set(products.map(p => p.manufacturer_name))).sort(),
    [products]
  );
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/products');
      // 商品管理に登録されている全商品を候補にする（フィルタしない）
      setProducts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('商品データの取得に失敗しました:', error);
      setProducts([]);
    }
  };

  const handleOpenDialog = (pattern?: DeliveryPattern, defaultStartDate?: string) => {
    if (readOnly) {
      setSnackbar({ open: true, message: '確定済みの月のため編集できません。', severity: 'error' });
      return;
    }
    if (pattern) {
      setEditingPattern(pattern);
      const deliveryDays = ensureArrayDays(pattern.delivery_days);
      
      // 既存データから曜日ごとの数量を復元（daily_quantitiesがない場合は従来のquantityを使用）
      let dailyQuantities: { [dayOfWeek: number]: number } = {};
      if (pattern.daily_quantities) {
        const dq = typeof pattern.daily_quantities === 'string' ? safeParse(pattern.daily_quantities) : pattern.daily_quantities;
        if (dq && typeof dq === 'object') {
          dailyQuantities = dq as { [dayOfWeek: number]: number };
        }
      }
      if (!pattern.daily_quantities && deliveryDays.length > 0) {
        // 従来のデータの場合、全ての配達日に同じ数量を設定
        dailyQuantities = {};
        deliveryDays.forEach((day: number) => {
          dailyQuantities[day] = pattern.quantity;
        });
      }
      
      setFormData({
        ...pattern,
        delivery_days: deliveryDays,
        daily_quantities: dailyQuantities,
        // 開始日はセルクリック日を優先（指定があれば）
        start_date: defaultStartDate || pattern.start_date,
      });
      // 単価入力の初期値
      setUnitPriceInput(String(pattern.unit_price ?? ''));
    } else {
      setEditingPattern(null);
      setFormData({
        customer_id: customerId,
        product_id: 0,
        quantity: 1,
        unit_price: 0,
        delivery_days: [],
        daily_quantities: {},
        start_date: defaultStartDate || new Date().toISOString().split('T')[0],
        is_active: true,
      });
      // 新規追加時は空文字
      setUnitPriceInput('');
    }
    // 臨時配達の場合の初期日付もセルクリック日を優先
    if (defaultStartDate) {
      setTemporaryDate(defaultStartDate);
    }
    setOpenDialog(true);
  };

  // 外部からダイアログを開くためのハンドル
  useImperativeHandle(ref, () => ({
    openForPattern: (pattern?: DeliveryPattern, defaultStartDate?: string) => {
      handleOpenDialog(pattern, defaultStartDate);
    },
  }));

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingPattern(null);
    setIsTemporaryMode(false);
    setTemporaryDate(new Date().toISOString().split('T')[0]);
    setTemporaryQuantity(1);
  };

  const handleProductChange = (productId: number) => {
    const selectedProduct = products.find(p => p.id === productId);
    if (selectedProduct) {
      setFormData({
        ...formData,
        product_id: productId,
        unit_price: selectedProduct.unit_price,
      });
      // 商品選択時の単価を文字列で反映
      setUnitPriceInput(String(selectedProduct.unit_price ?? ''));
    }
  };

  

  // 「今契約している商品（patterns内）」を除外して表示するためのリスト（通常モード時のみ適用）
  const contractedProductIds = new Set<number>((patterns || []).filter(p => p.is_active).map(p => p.product_id));
  const selectableProducts = products; // すべての商品を表示（契約済みも含む）
  const filteredProducts = manufacturerFilter
    ? selectableProducts.filter((p) => p.manufacturer_name === manufacturerFilter)
    : selectableProducts;

  // モード切替時に、通常モードへ移行した場合は契約済み商品の選択を解除
  // ※ 全商品を表示する仕様に変更したため、選択解除のロジックは不要
  // useEffect(() => {
  //   if (!isTemporaryMode && formData.product_id && contractedProductIds.has(formData.product_id)) {
  //     setFormData({ ...formData, product_id: 0 });
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [isTemporaryMode]);

  const handleSave = async () => {
    try {
      if (readOnly) {
        setSnackbar({ open: true, message: '確定済みの月のため編集できません。', severity: 'error' });
        return;
      }
      // 単価文字列を保存時にパース
      const trimmedUnit = unitPriceInput.trim();
      let parsedUnitPrice: number | null = null;
      if (trimmedUnit === '') {
        parsedUnitPrice = null;
      } else {
        const num = Number(trimmedUnit);
        if (Number.isNaN(num)) {
          setSnackbar({ open: true, message: '単価は数値で入力してください', severity: 'error' });
          return;
        }
        parsedUnitPrice = num;
      }

      if (isTemporaryMode) {
        // 臨時配達の保存
        if (!formData.product_id || !temporaryQuantity || temporaryQuantity <= 0) {
          setSnackbar({
            open: true,
            message: '商品と数量は必須項目です。',
            severity: 'error',
          });
          return;
        }

        const temporaryData = {
          customer_id: customerId,
          change_date: temporaryDate,
          change_type: 'add',
          product_id: formData.product_id,
          quantity: temporaryQuantity,
          unit_price: parsedUnitPrice ?? formData.unit_price ?? null,
          reason: '臨時配達'
        };

        const res = await axios.post('/api/temporary-changes', temporaryData);
        const createdTempId = res?.data?.id as number | undefined;
        if (createdTempId && onRecordUndo) {
          onRecordUndo({
            description: '臨時配達の追加を元に戻す',
            revert: async () => {
              await axios.delete(`/api/temporary-changes/${createdTempId}`);
            },
          });
        }
        setSnackbar({
          open: true,
          message: '臨時配達を追加しました。',
          severity: 'success',
        });
        
        handleCloseDialog();
        if (onTemporaryChangesUpdate) {
          onTemporaryChangesUpdate();
        }
        return;
      } else {
        // 通常の配達パターンの保存
        const hasQuantities = formData.daily_quantities && Object.keys(formData.daily_quantities).length > 0;
        
        if (!formData.product_id || !hasQuantities) {
          setSnackbar({
            open: true,
            message: '商品と配達数量は必須項目です。',
            severity: 'error',
          });
          return;
        }

        const dataToSend = {
          ...formData,
          unit_price: parsedUnitPrice ?? formData.unit_price ?? null,
          delivery_days: JSON.stringify(formData.delivery_days),
          daily_quantities: JSON.stringify(formData.daily_quantities),
        };

        if (editingPattern) {
          const originalStart = editingPattern.start_date;
          const newStart = formData.start_date || originalStart;

          // JSON文字列化のユーティリティ（既存/新規で二重JSONを避ける）
          const toDaysString = (val: any): string => {
            if (Array.isArray(val)) return JSON.stringify(val);
            if (typeof val === 'string') return val;
            return '[]';
          };
          const toDQString = (val: any): string | null => {
            if (!val) return null;
            if (typeof val === 'string') return val;
            return JSON.stringify(val);
          };

          // 新しい開始日が元の開始日より後の場合は、過去分を保持するためにパターンを分割
          if (newStart && originalStart && new Date(newStart) > new Date(originalStart)) {
            const oldEndDate = new Date(new Date(newStart).getTime() - 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0];

            // 1) 既存パターンを分割開始前日で終了し、履歴として非アクティブル化
            await axios.put(`/api/delivery-patterns/${editingPattern.id}`, {
              product_id: editingPattern.product_id,
              quantity: editingPattern.quantity,
              unit_price: editingPattern.unit_price,
              delivery_days: toDaysString(editingPattern.delivery_days),
              daily_quantities: toDQString(editingPattern.daily_quantities),
              start_date: editingPattern.start_date,
              end_date: oldEndDate,
              // 過去分をカレンダーで表示させるため、履歴も is_active=1 のまま保持
              is_active: 1,
            });

            // 2) 新パターンを新開始日で作成（フォームの設定を適用）
            const createRes = await axios.post('/api/delivery-patterns', {
              customer_id: editingPattern.customer_id,
              product_id: formData.product_id,
              quantity: formData.quantity,
              unit_price: formData.unit_price,
              delivery_days: toDaysString(formData.delivery_days),
              daily_quantities: toDQString(formData.daily_quantities),
              start_date: newStart,
              end_date: formData.end_date || null,
              is_active: 1,
            });
            const newPatternId = createRes?.data?.id as number | undefined;
            if (onRecordUndo && newPatternId) {
              const prevEnd = editingPattern.end_date || null;
              const prevActive = editingPattern.is_active ? 1 : 0;
              onRecordUndo({
                description: '配達パターン分割の取り消し',
                revert: async () => {
                  try {
                    await axios.delete(`/api/delivery-patterns/${newPatternId}`);
                  } catch (e) {
                    console.error('新規パターン削除（Undo）に失敗:', e);
                  }
                  try {
                    await axios.put(`/api/delivery-patterns/${editingPattern.id}`, {
                      product_id: editingPattern.product_id,
                      quantity: editingPattern.quantity,
                      unit_price: editingPattern.unit_price,
                      delivery_days: toDaysString(editingPattern.delivery_days),
                      daily_quantities: toDQString(editingPattern.daily_quantities),
                      start_date: editingPattern.start_date,
                      end_date: prevEnd,
                      is_active: prevActive,
                    });
                  } catch (e) {
                    console.error('既存パターン復元（Undo）に失敗:', e);
                  }
                },
              });
            }

            setSnackbar({
              open: true,
              message: '配達パターンを分割して更新しました。',
              severity: 'success',
            });
          } else {
            // 従来通りの更新（開始日が同日または前倒しの場合）
            await axios.put(`/api/delivery-patterns/${editingPattern.id}`, dataToSend);
            if (onRecordUndo) {
              const prevEnd = editingPattern.end_date || null;
              const prevActive = editingPattern.is_active ? 1 : 0;
              onRecordUndo({
                description: '配達パターン更新の取り消し',
                revert: async () => {
                  try {
                    await axios.put(`/api/delivery-patterns/${editingPattern.id}`, {
                      product_id: editingPattern.product_id,
                      quantity: editingPattern.quantity,
                      unit_price: editingPattern.unit_price,
                      delivery_days: toDaysString(editingPattern.delivery_days),
                      daily_quantities: toDQString(editingPattern.daily_quantities),
                      start_date: editingPattern.start_date,
                      end_date: prevEnd,
                      is_active: prevActive,
                    });
                  } catch (e) {
                    console.error('配達パターン更新のUndoに失敗:', e);
                  }
                },
              });
            }
            setSnackbar({
              open: true,
              message: '配達パターンを更新しました。',
              severity: 'success',
            });
          }
        } else {
          const res = await axios.post('/api/delivery-patterns', dataToSend);
          const createdId = res?.data?.id as number | undefined;
          if (createdId && onRecordUndo) {
            onRecordUndo({
              description: '配達パターン追加の取り消し',
              revert: async () => {
                await axios.delete(`/api/delivery-patterns/${createdId}`);
              },
            });
          }
          setSnackbar({
            open: true,
            message: '配達パターンを追加しました。',
            severity: 'success',
          });
        }
      }

      handleCloseDialog();
      onPatternsChange();
    } catch (error: any) {
      console.error('保存に失敗しました:', error);
      // サーバーからの詳細メッセージがあれば表示（例: 重複臨時追加の409メッセージ）
      const serverMessage = (error?.response?.data?.message) as string | undefined;
      setSnackbar({
        open: true,
        message: serverMessage || '保存に失敗しました。',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (patternId: number) => {
    if (readOnly) {
      setSnackbar({ open: true, message: '確定済みの月のため編集できません。', severity: 'error' });
      return;
    }
    if (!window.confirm('この配達パターンを削除しますか？')) {
      return;
    }

    try {
      const deleted = patterns.find(p => p.id === patternId);
      await axios.delete(`/api/delivery-patterns/${patternId}`);
      if (deleted && onRecordUndo) {
        const toDaysString = (val: any): string => {
          if (Array.isArray(val)) return JSON.stringify(val);
          if (typeof val === 'string') return val;
          return '[]';
        };
        const toDQString = (val: any): string | null => {
          if (!val) return null;
          if (typeof val === 'string') return val;
          return JSON.stringify(val);
        };
        onRecordUndo({
          description: '配達パターン削除の取り消し',
          revert: async () => {
            try {
              await axios.post('/api/delivery-patterns', {
                customer_id: deleted.customer_id,
                product_id: deleted.product_id,
                quantity: deleted.quantity,
                unit_price: deleted.unit_price,
                delivery_days: toDaysString(deleted.delivery_days),
                daily_quantities: toDQString(deleted.daily_quantities),
                start_date: deleted.start_date,
                end_date: deleted.end_date || null,
                is_active: deleted.is_active ? 1 : 0,
              });
            } catch (e) {
              console.error('配達パターン再作成（Undo）に失敗:', e);
            }
          },
        });
      }
      setSnackbar({
        open: true,
        message: '配達パターンを削除しました。',
        severity: 'success',
      });
      onPatternsChange();
    } catch (error) {
      console.error('配達パターンの削除に失敗しました:', error);
      setSnackbar({
        open: true,
        message: '配達パターンの削除に失敗しました。',
        severity: 'error',
      });
    }
  };

  const safeParse = (val: any) => {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  const ensureArrayDays = (days: any): number[] => {
    if (Array.isArray(days)) return days as number[];
    if (typeof days === 'string') {
      const parsed = safeParse(days);
      if (Array.isArray(parsed)) return parsed as number[];
      if (typeof parsed === 'string') {
        const parsedTwice = safeParse(parsed);
        if (Array.isArray(parsedTwice)) return parsedTwice as number[];
      }
    }
    return [];
  };

  const formatDeliveryDays = (days: string | number[]) => {
    const dayArray = ensureArrayDays(days);
    return dayArray.map((day: number) => dayNames[day]).join(', ');
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">配達パターン設定</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            disabled={readOnly}
            title={readOnly ? '確定済みの月のため編集不可' : undefined}
          >
            パターン追加
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>商品名</TableCell>
                <TableCell>メーカー</TableCell>
                <TableCell align="center">数量</TableCell>
                <TableCell align="right">単価</TableCell>
                <TableCell>配達曜日</TableCell>
                <TableCell>開始日</TableCell>
                <TableCell>終了日</TableCell>
                <TableCell>状態</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {patterns.map((pattern) => (
                <TableRow key={pattern.id}>
                  <TableCell>{pattern.product_name}</TableCell>
                  <TableCell>{pattern.manufacturer_name}</TableCell>
                  <TableCell align="center">{pattern.quantity}{pattern.unit}</TableCell>
                  <TableCell align="right">¥{pattern.unit_price.toLocaleString()}</TableCell>
                  <TableCell>{formatDeliveryDays(pattern.delivery_days)}</TableCell>
                  <TableCell>{pattern.start_date}</TableCell>
                  <TableCell>{pattern.end_date || '無期限'}</TableCell>
                  <TableCell>
                    <Chip
                      label={pattern.is_active ? '有効' : '無効'}
                      color={pattern.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(pattern)}
                      disabled={readOnly}
                      title={readOnly ? '確定済みの月のため編集不可' : undefined}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(pattern.id!)}
                      disabled={readOnly}
                      title={readOnly ? '確定済みの月のため編集不可' : undefined}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {patterns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography variant="body2" color="textSecondary">
                      配達パターンが設定されていません。
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* 配達パターン編集ダイアログ */}
        <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
          <DialogTitle>
            {editingPattern ? '配達パターン編集' : '配達パターン追加'}
          </DialogTitle>
          <DialogContent>
            {/* 配達モード切り替え（新規追加時のみ） */}
            {!editingPattern && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  配達タイプ
                </Typography>
                <ToggleButtonGroup
                  value={isTemporaryMode ? 'temporary' : 'regular'}
                  exclusive
                  onChange={(e, value) => {
                    if (value !== null) {
                      setIsTemporaryMode(value === 'temporary');
                    }
                  }}
                  aria-label="配達タイプ"
                  size="small"
                >
                  <ToggleButton value="regular" aria-label="定期配達">
                    <ScheduleIcon sx={{ mr: 1 }} />
                    定期配達
                  </ToggleButton>
                  <ToggleButton value="temporary" aria-label="臨時配達">
                    <CalendarTodayIcon sx={{ mr: 1 }} />
                    臨時
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>メーカー</InputLabel>
                  <Select
                    value={manufacturerFilter}
                    onChange={(e) => setManufacturerFilter(String(e.target.value))}
                    label="メーカー"
                  >
                    <MenuItem value="">全メーカー</MenuItem>
                    {manufacturerNames.map((name) => (
                      <MenuItem key={name} value={name}>{name}</MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    メーカーで絞り込みできます（現在: {manufacturerFilter || '全メーカー'}）
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>商品</InputLabel>
                  <Select
                    value={formData.product_id || ''}
                    onChange={(e) => handleProductChange(Number(e.target.value))}
                    label="商品"
                  >
                    {filteredProducts.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.manufacturer_name} - {product.product_name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {!isTemporaryMode && formData.product_id && contractedProductIds.has(formData.product_id)
                      ? '選択中の商品は既に契約されています。必要に応じて重複追加となります。'
                      : '商品管理に登録されている全商品が表示されています'}
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="単価"
                  type="text"
                  value={unitPriceInput}
                  onChange={(e) => setUnitPriceInput(e.target.value)}
                  inputProps={{ inputMode: 'numeric' }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom sx={{ mt: 2, mb: 1 }}>
                  {isTemporaryMode ? '臨時配達設定' : '配達パターン設定'}
                </Typography>
                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                  {isTemporaryMode ? (
                    // 臨時配達モード
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          配達日と数量を指定してください
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="配達日"
                          type="date"
                          value={temporaryDate}
                          onChange={(e) => setTemporaryDate(e.target.value)}
                          InputLabelProps={{
                            shrink: true,
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="数量"
                          type="number"
                          value={temporaryQuantity}
                          onChange={(e) => setTemporaryQuantity(Number(e.target.value))}
                          inputProps={{ min: 1, max: 99 }}
                        />
                      </Grid>
                    </Grid>
                  ) : (
                    // 通常の配達パターンモード
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          各曜日の配達数量を入力してください（0の場合は配達なし）
                        </Typography>
                      </Grid>
                      {dayNames.map((day, index) => (
                        <Grid item xs={6} md={3} key={index}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" gutterBottom>
                              {day}曜日
                            </Typography>
                            <TextField
                              size="small"
                              type="number"
                              value={formData.daily_quantities?.[index] || 0}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                const newQuantities = { ...formData.daily_quantities };
                                if (value > 0) {
                                  newQuantities[index] = value;
                                } else {
                                  delete newQuantities[index];
                                }
                                
                                // delivery_daysも自動更新
                                const newDeliveryDays = Object.keys(newQuantities).map(Number);
                                
                                setFormData({ 
                                  ...formData, 
                                  daily_quantities: newQuantities,
                                  delivery_days: newDeliveryDays,
                                  quantity: Math.max(...Object.values(newQuantities), 0) // 最大値を設定（後方互換性）
                                });
                              }}
                              inputProps={{ min: 0, max: 99 }}
                              sx={{ width: '80px' }}
                            />
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </Box>
              </Grid>
              {/* 開始日・終了日は通常モード時のみ表示 */}
              {!isTemporaryMode && (
                <>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="開始日"
                      type="date"
                      value={formData.start_date || ''}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="終了日（任意）"
                      type="date"
                      value={formData.end_date || ''}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} startIcon={<CancelIcon />}>
              キャンセル
            </Button>
            <Button onClick={handleSave} variant="contained" startIcon={<SaveIcon />} disabled={readOnly} title={readOnly ? '確定済みの月のため編集不可' : undefined}>
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

export default DeliveryPatternManager;