import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Grid,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Transform as TransformIcon,
  Save as SaveIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import apiClient from '../utils/apiClient';

interface Course {
  id: number;
  custom_id?: string;
  course_name: string;
}

interface Product {
  id: number;
  custom_id: string;
  product_name: string;
  manufacturer_name?: string;
  manufacturer_id?: number;
  unit_price?: number;
}

interface Customer {
  id: number;
  custom_id: string;
  customer_name: string;
  course_id: number;
}

const BulkUpdate: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  
  // コース・商品データ
  const [courses, setCourses] = useState<Course[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<Array<{ id: number; manufacturer_name: string }>>([]);
  const [selectedManufacturer, setSelectedManufacturer] = useState<number | ''>('');
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingManufacturers, setLoadingManufacturers] = useState(false);

  // 増配処理用の状態
  const [selectedCourseForIncrease, setSelectedCourseForIncrease] = useState<number | ''>('');
  const [increaseStartDate, setIncreaseStartDate] = useState<string>('');
  const [increaseEndDate, setIncreaseEndDate] = useState<string>('');
  const [increaseTargetDate, setIncreaseTargetDate] = useState<string>('');
  const [increaseAggregate, setIncreaseAggregate] = useState<boolean>(true);
  const [processingIncrease, setProcessingIncrease] = useState(false);

  // 商品単価一括変更用の状態
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('');
  const [newUnitPrice, setNewUnitPrice] = useState<string>('');
  const [priceChangeStartMonth, setPriceChangeStartMonth] = useState<string>('');
  const [selectedCourseForPrice, setSelectedCourseForPrice] = useState<number | ''>('');
  const [applyToAllCustomers, setApplyToAllCustomers] = useState(true);
  const [processingPrice, setProcessingPrice] = useState(false);
  const [previewCustomers, setPreviewCustomers] = useState<Customer[]>([]);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  // ログ（タブ別）
  const [logsIncrease, setLogsIncrease] = useState<Array<{ id: number; op_type: string; description: string; params_json?: string; data_json?: string; created_at: string }>>([]);
  const [logsPrice, setLogsPrice] = useState<Array<{ id: number; op_type: string; description: string; params_json?: string; data_json?: string; created_at: string }>>([]);
  const [loadingLogsIncrease, setLoadingLogsIncrease] = useState(false);
  const [loadingLogsPrice, setLoadingLogsPrice] = useState(false);

  // 通知
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'warning' | 'info'
  });

  // コース一覧取得
  const fetchCourses = useCallback(async () => {
    try {
      setLoadingCourses(true);
      const response = await apiClient.get('/api/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('コース一覧取得エラー:', error);
      setSnackbar({
        open: true,
        message: 'コース一覧の取得に失敗しました',
        severity: 'error'
      });
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  // メーカー一覧取得
  const fetchManufacturers = useCallback(async () => {
    try {
      setLoadingManufacturers(true);
      const response = await apiClient.get('/api/masters/manufacturers');
      setManufacturers(response.data);
    } catch (error) {
      console.error('メーカー一覧取得エラー:', error);
      setSnackbar({
        open: true,
        message: 'メーカー一覧の取得に失敗しました',
        severity: 'error'
      });
    } finally {
      setLoadingManufacturers(false);
    }
  }, []);

  // ログ取得（共通取得→タブ別に分配）
  const fetchLogs = useCallback(async () => {
    try {
      setLoadingLogsIncrease(true);
      setLoadingLogsPrice(true);
      const res = await apiClient.get('/api/bulk-update/logs');
      const all = Array.isArray(res.data) ? res.data : [];
      setLogsIncrease(all.filter((l: any) => l.op_type === 'increase-delivery'));
      setLogsPrice(all.filter((l: any) => l.op_type === 'price-change'));
    } catch (e) {
      console.error('ログ取得に失敗しました', e);
    } finally {
      setLoadingLogsIncrease(false);
      setLoadingLogsPrice(false);
    }
  }, []);

  // 商品一覧取得
  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const response = await apiClient.get('/api/products');
      setProducts(response.data);
    } catch (error) {
      console.error('商品一覧取得エラー:', error);
      setSnackbar({
        open: true,
        message: '商品一覧の取得に失敗しました',
        severity: 'error'
      });
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
    fetchProducts();
    fetchManufacturers();
    fetchLogs();
  }, [fetchCourses, fetchProducts, fetchManufacturers, fetchLogs]);

  // 増配処理の実行
  const handleProcessIncrease = async () => {
    if (!selectedCourseForIncrease || !increaseStartDate || !increaseEndDate || (increaseAggregate && !increaseTargetDate)) {
      setSnackbar({
        open: true,
        message: increaseAggregate ? 'コース、休業開始日、休業終了日、指定日を入力してください' : 'コース、休業開始日、休業終了日を入力してください',
        severity: 'error'
      });
      return;
    }

    try {
      setProcessingIncrease(true);
      const response = await apiClient.post('/api/bulk-update/increase-delivery', {
        courseId: selectedCourseForIncrease,
        startDate: increaseStartDate,
        endDate: increaseEndDate,
        targetDate: increaseAggregate ? increaseTargetDate : undefined,
        aggregate: increaseAggregate
      });
      
      setSnackbar({
        open: true,
        message: `増配処理が完了しました。影響を受けた顧客数: ${response.data.affectedCustomers || 0}`,
        severity: 'success'
      });

      // フォームをリセット
      setSelectedCourseForIncrease('');
      setIncreaseStartDate('');
      setIncreaseEndDate('');
      setIncreaseTargetDate('');
      setIncreaseAggregate(true);
      // ログを即時更新
      fetchLogs();
    } catch (error: any) {
      console.error('増配処理エラー:', error);
      const errorMessage = error?.response?.data?.error || '増配処理に失敗しました';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    } finally {
      setProcessingIncrease(false);
    }
  };

  // 単価変更のプレビュー
  const handlePreviewPriceChange = async () => {
    if (!selectedProduct || !newUnitPrice || !priceChangeStartMonth) {
      setSnackbar({
        open: true,
        message: '商品、新しい単価、変更開始月を入力してください',
        severity: 'error'
      });
      return;
    }

    const price = parseFloat(newUnitPrice);
    if (isNaN(price) || price < 0) {
      setSnackbar({
        open: true,
        message: '単価は0以上の数値で入力してください',
        severity: 'error'
      });
      return;
    }

    try {
      const response = await apiClient.post('/api/bulk-update/price-change/preview', {
        productId: selectedProduct,
        newUnitPrice: price,
        startMonth: priceChangeStartMonth,
        courseId: applyToAllCustomers ? null : selectedCourseForPrice,
      });
      
      setPreviewCustomers(response.data.customers || []);
      setPreviewDialogOpen(true);
    } catch (error: any) {
      console.error('プレビューエラー:', error);
      const errorMessage = error?.response?.data?.error || 'プレビューの取得に失敗しました';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    }
  };

  // ロールバック処理
  const handleRollbackAll = async () => {
    if (!window.confirm('増配処理1回と単価変更2回を元に戻しますか？この操作は取り消せません。')) {
      return;
    }

    try {
      setRollingBack(true);
      const response = await apiClient.post('/api/bulk-update/rollback-all');
      
      setSnackbar({
        open: true,
        message: `ロールバックが完了しました。増配処理: ${response.data.increaseDeliveryDeleted || 0}件削除、単価変更: ${response.data.priceChangeDeleted || 0}件削除、${response.data.priceChangeRestored || 0}件復元`,
        severity: 'success'
      });
    } catch (error: any) {
      console.error('ロールバックエラー:', error);
      const errorMessage = error?.response?.data?.error || 'ロールバックに失敗しました';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    } finally {
      setRollingBack(false);
    }
  };

  // 単価変更の実行
  const handleProcessPriceChange = async () => {
    if (!selectedProduct || !newUnitPrice || !priceChangeStartMonth) {
      setSnackbar({
        open: true,
        message: '商品、新しい単価、変更開始月を入力してください',
        severity: 'error'
      });
      return;
    }

    const price = parseFloat(newUnitPrice);
    if (isNaN(price) || price < 0) {
      setSnackbar({
        open: true,
        message: '単価は0以上の数値で入力してください',
        severity: 'error'
      });
      return;
    }

    try {
      setProcessingPrice(true);
      const response = await apiClient.post('/api/bulk-update/price-change', {
        productId: selectedProduct,
        newUnitPrice: price,
        startMonth: priceChangeStartMonth,
        courseId: applyToAllCustomers ? null : selectedCourseForPrice,
      });
      
      setSnackbar({
        open: true,
        message: `商品単価の一括変更が完了しました。影響を受けた顧客数: ${response.data.affectedCustomers || 0}`,
        severity: 'success'
      });

      // フォームをリセット
      setSelectedProduct('');
      setNewUnitPrice('');
      setPriceChangeStartMonth('');
      setSelectedCourseForPrice('');
      setApplyToAllCustomers(true);
      setPreviewDialogOpen(false);
      // ログを即時更新
      fetchLogs();
    } catch (error: any) {
      console.error('単価変更エラー:', error);
      const errorMessage = error?.response?.data?.error || '商品単価の一括変更に失敗しました';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    } finally {
      setProcessingPrice(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          全体変更
        </Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={handleRollbackAll}
          disabled={rollingBack}
          startIcon={rollingBack ? <CircularProgress size={20} /> : undefined}
        >
          {rollingBack ? 'ロールバック中...' : '最近の変更を元に戻す'}
        </Button>
      </Box>

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label="臨時休業処理" />
        <Tab label="商品単価一括変更" />
      </Tabs>

      {/* 増配処理タブ */}
      {tabValue === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              増配処理
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              お盆やお正月など一定期間を休業する場合、休業期間分の配達商品を前もってまとめて配達することができます。
              例：月/木で3本/4本お届けの場合、木曜が休業期間の時その前の月曜に7本お届けします。
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>対象コース</InputLabel>
                  <Select
                    value={selectedCourseForIncrease}
                    label="対象コース"
                    onChange={(e) => setSelectedCourseForIncrease(e.target.value as number | '')}
                    disabled={loadingCourses || processingIncrease}
                  >
                    <MenuItem value="">
                      <em>コースを選択してください</em>
                    </MenuItem>
                    {courses.map((course) => (
                      <MenuItem key={course.id} value={course.id}>
                        {course.course_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="休業開始日"
                  type="date"
                  value={increaseStartDate}
                  onChange={(e) => setIncreaseStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={processingIncrease}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="休業終了日"
                  type="date"
                  value={increaseEndDate}
                  onChange={(e) => setIncreaseEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={processingIncrease}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    fullWidth
                    label="指定日"
                    type="date"
                    value={increaseTargetDate}
                    onChange={(e) => setIncreaseTargetDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    disabled={processingIncrease || !increaseAggregate}
                  />
                  <FormControlLabel
                    control={<Checkbox checked={increaseAggregate} onChange={(_, v) => setIncreaseAggregate(v)} />}
                    label="指定日に増配する"
                  />
                </Box>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  startIcon={processingIncrease ? <CircularProgress size={20} /> : <TransformIcon />}
                  onClick={handleProcessIncrease}
                  disabled={!selectedCourseForIncrease || !increaseStartDate || !increaseEndDate || (increaseAggregate && !increaseTargetDate) || processingIncrease}
                  size="large"
                >
                  {processingIncrease ? '処理中...' : '増配処理を実行'}
                </Button>
              </Grid>
            </Grid>
            {/* 処理ログ（臨時休業） */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                処理ログ（臨時休業）
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>日時</TableCell>
                      <TableCell>種別</TableCell>
                      <TableCell>内容</TableCell>
                      <TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loadingLogsIncrease ? (
                      <TableRow>
                        <TableCell colSpan={4}>読み込み中...</TableCell>
                      </TableRow>
                    ) : logsIncrease.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>ログはありません</TableCell>
                      </TableRow>
                    ) : (
                      logsIncrease.map((log) => (
                        <TableRow
                          key={log.id}
                          hover={!/取り消し済/.test(log.description || '')}
                          sx={{ opacity: /取り消し済/.test(log.description || '') ? 0.5 : 1 }}
                        >
                          <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                          <TableCell>{log.op_type}</TableCell>
                          <TableCell>{log.description}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              disabled={/取り消し済/.test(log.description || '')}
                              onClick={async () => {
                                if (!window.confirm('この処理を取り消しますか？')) return;
                                try {
                                  await apiClient.post(`/api/bulk-update/logs/${log.id}/rollback`);
                                  await fetchLogs();
                                  setSnackbar({ open: true, message: '取り消しを実行しました', severity: 'success' });
                                } catch (e: any) {
                                  console.error('ロールバック失敗', e);
                                  setSnackbar({ open: true, message: e?.response?.data?.error || '取り消しに失敗しました', severity: 'error' });
                                }
                              }}
                            >
                              { /取り消し済/.test(log.description || '') ? '取り消し済' : '取り消し' }
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 商品単価一括変更タブ */}
      {tabValue === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              商品単価一括変更
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              メーカーの仕入れ値変更などにより、全顧客の特定の商品の価格を任意の月から一括で変更できます。
            </Alert>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>メーカー</InputLabel>
                  <Select
                    value={selectedManufacturer}
                    label="メーカー"
                    onChange={(e) => {
                      setSelectedManufacturer(e.target.value as number | '');
                      setSelectedProduct(''); // メーカー変更時に商品選択をリセット
                    }}
                    disabled={loadingManufacturers || processingPrice}
                  >
                    <MenuItem value="">
                      <em>すべてのメーカー</em>
                    </MenuItem>
                    {manufacturers.map((manufacturer) => (
                      <MenuItem key={manufacturer.id} value={manufacturer.id}>
                        {manufacturer.manufacturer_name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>対象商品</InputLabel>
                  <Select
                    value={selectedProduct}
                    label="対象商品"
                    onChange={(e) => {
                      const productId = e.target.value as number | '';
                      setSelectedProduct(productId);
                      // 選択された商品の現在の単価を表示
                      if (productId) {
                        const product = products.find(p => p.id === productId);
                        if (product && product.unit_price !== undefined) {
                          setNewUnitPrice(product.unit_price.toString());
                        } else {
                          setNewUnitPrice('');
                        }
                      } else {
                        setNewUnitPrice('');
                      }
                    }}
                    disabled={loadingProducts || processingPrice}
                  >
                    <MenuItem value="">
                      <em>商品を選択してください</em>
                    </MenuItem>
                    {products
                      .filter(p => !selectedManufacturer || p.manufacturer_id === selectedManufacturer)
                      .map((product) => (
                        <MenuItem key={product.id} value={product.id}>
                          {product.product_name} {product.manufacturer_name ? `(${product.manufacturer_name})` : ''} - 現在の単価: {product.unit_price?.toLocaleString() || 0}円
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="新しい単価"
                  type="number"
                  value={newUnitPrice}
                  onChange={(e) => setNewUnitPrice(e.target.value)}
                  InputProps={{
                    endAdornment: <Typography variant="body2" sx={{ mr: 1 }}>円</Typography>
                  }}
                  helperText={selectedProduct ? `現在の単価: ${products.find(p => p.id === selectedProduct)?.unit_price?.toLocaleString() || 0}円` : ''}
                  disabled={processingPrice}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="変更開始月"
                  type="month"
                  value={priceChangeStartMonth}
                  onChange={(e) => setPriceChangeStartMonth(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  disabled={processingPrice}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>適用範囲</InputLabel>
                  <Select
                    value={applyToAllCustomers ? 'all' : 'course'}
                    label="適用範囲"
                    onChange={(e) => {
                      const isAll = e.target.value === 'all';
                      setApplyToAllCustomers(isAll);
                      if (isAll) {
                        setSelectedCourseForPrice('');
                      }
                    }}
                    disabled={processingPrice}
                  >
                    <MenuItem value="all">全顧客</MenuItem>
                    <MenuItem value="course">コース指定</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              {!applyToAllCustomers && (
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>対象コース</InputLabel>
                    <Select
                      value={selectedCourseForPrice}
                      label="対象コース"
                      onChange={(e) => setSelectedCourseForPrice(e.target.value as number | '')}
                      disabled={loadingCourses || processingPrice}
                    >
                      <MenuItem value="">
                        <em>コースを選択してください</em>
                      </MenuItem>
                      {courses.map((course) => (
                        <MenuItem key={course.id} value={course.id}>
                          {course.course_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handlePreviewPriceChange}
                    disabled={!selectedProduct || !newUnitPrice || !priceChangeStartMonth || processingPrice}
                  >
                    プレビュー
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={processingPrice ? <CircularProgress size={20} /> : <SaveIcon />}
                    onClick={handleProcessPriceChange}
                    disabled={
                      !selectedProduct ||
                      !newUnitPrice ||
                      !priceChangeStartMonth ||
                      (!applyToAllCustomers && !selectedCourseForPrice) ||
                      processingPrice
                    }
                    size="large"
                  >
                    {processingPrice ? '処理中...' : '単価変更を実行'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
            {/* 処理ログ（単価変更） */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                処理ログ（単価変更）
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>日時</TableCell>
                      <TableCell>種別</TableCell>
                      <TableCell>内容</TableCell>
                      <TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loadingLogsPrice ? (
                      <TableRow>
                        <TableCell colSpan={4}>読み込み中...</TableCell>
                      </TableRow>
                    ) : logsPrice.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>ログはありません</TableCell>
                      </TableRow>
                    ) : (
                      logsPrice.map((log) => (
                        <TableRow
                          key={log.id}
                          hover={!/取り消し済/.test(log.description || '')}
                          sx={{ opacity: /取り消し済/.test(log.description || '') ? 0.5 : 1 }}
                        >
                          <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                          <TableCell>{log.op_type}</TableCell>
                          <TableCell>{log.description}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              disabled={/取り消し済/.test(log.description || '')}
                              onClick={async () => {
                                if (!window.confirm('この処理を取り消しますか？')) return;
                                try {
                                  await apiClient.post(`/api/bulk-update/logs/${log.id}/rollback`);
                                  await fetchLogs();
                                  setSnackbar({ open: true, message: '取り消しを実行しました', severity: 'success' });
                                } catch (e: any) {
                                  console.error('ロールバック失敗', e);
                                  setSnackbar({ open: true, message: e?.response?.data?.error || '取り消しに失敗しました', severity: 'error' });
                                }
                              }}
                            >
                              { /取り消し済/.test(log.description || '') ? '取り消し済' : '取り消し' }
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* プレビューダイアログ */}
      <Dialog
        open={previewDialogOpen}
        onClose={() => setPreviewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>影響を受ける顧客一覧</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            以下の顧客の配達パターンが変更されます。
          </DialogContentText>
          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>顧客ID</TableCell>
                  <TableCell>顧客名</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {previewCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} align="center">
                      <Typography color="textSecondary">
                        該当する顧客がありません
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  previewCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Chip label={customer.custom_id} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{customer.customer_name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialogOpen(false)}>閉じる</Button>
          <Button
            variant="contained"
            startIcon={<CheckCircleIcon />}
            onClick={handleProcessPriceChange}
            disabled={processingPrice}
          >
            この内容で実行
          </Button>
        </DialogActions>
      </Dialog>

      {/* 通知 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      
    </Box>
  );
};

export default BulkUpdate;

