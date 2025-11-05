import React, { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import moment from 'moment';
import apiClient from '../utils/apiClient';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface SalesData {
  totalSales: number;
  totalGrossProfit: number;
  monthlyData: {
    year: number;
    month: number;
    sales: number;
    cost: number;
    grossProfit: number;
  }[];
}

interface ProductSalesData {
  productId: string;
  productName: string;
  sales: number;
  cost: number;
  grossProfit: number;
  quantity: number;
}

interface CourseSalesData {
  courseId: number;
  courseName: string;
  sales: number;
  cost: number;
  grossProfit: number;
  customerCount: number;
}

interface NewCustomer {
  id: number;
  customId: string;
  customerName: string;
  courseName: string;
  contractStartDate: string;
}

interface CancelledCustomer {
  id: number;
  customId: string;
  customerName: string;
  courseName: string;
  contractEndDate: string;
}

interface ProductCustomer {
  customerId: number;
  customId: string;
  customerName: string;
  courseName: string;
  quantity: number;
  totalAmount: number;
}

const Analyses: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);

  // 売上・粗利分析
  const [salesStartDate, setSalesStartDate] = useState<Date | null>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [salesEndDate, setSalesEndDate] = useState<Date | null>(new Date());
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [productSalesData, setProductSalesData] = useState<ProductSalesData[]>([]);
  const [courseSalesData, setCourseSalesData] = useState<CourseSalesData[]>([]);

  // 顧客推移分析
  const [customerMonth, setCustomerMonth] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  );
  const [newCustomers, setNewCustomers] = useState<NewCustomer[]>([]);
  const [cancelledCustomers, setCancelledCustomers] = useState<CancelledCustomer[]>([]);

  // 商品別顧客リスト
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productCustomers, setProductCustomers] = useState<ProductCustomer[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // 売上・粗利分析の取得
  const fetchSalesData = async () => {
    if (!salesStartDate || !salesEndDate) return;
    setLoading(true);
    try {
      const start = `${salesStartDate.getFullYear()}-${String(salesStartDate.getMonth() + 1).padStart(2, '0')}-${String(salesStartDate.getDate()).padStart(2, '0')}`;
      const end = `${salesEndDate.getFullYear()}-${String(salesEndDate.getMonth() + 1).padStart(2, '0')}-${String(salesEndDate.getDate()).padStart(2, '0')}`;
      
      const [salesRes, productRes, courseRes] = await Promise.all([
        apiClient.get(`/api/analyses/sales?startDate=${start}&endDate=${end}`),
        apiClient.get(`/api/analyses/product-sales?startDate=${start}&endDate=${end}`),
        apiClient.get(`/api/analyses/course-sales?startDate=${start}&endDate=${end}`),
      ]);

      setSalesData(salesRes.data);
      setProductSalesData(productRes.data);
      setCourseSalesData(courseRes.data);
    } catch (error) {
      console.error('売上データの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // 新規・解約客の取得
  const fetchCustomerChanges = async () => {
    setLoading(true);
    try {
      const [newRes, cancelledRes] = await Promise.all([
        apiClient.get(`/api/analyses/new-customers?month=${customerMonth}`),
        apiClient.get(`/api/analyses/cancelled-customers?month=${customerMonth}`),
      ]);

      setNewCustomers(newRes.data);
      setCancelledCustomers(cancelledRes.data);
    } catch (error) {
      console.error('顧客推移データの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // 商品別顧客リストの取得
  const fetchProductCustomers = async () => {
    if (!selectedProductId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/analyses/product-customers?productId=${selectedProductId}`);
      setProductCustomers(res.data);
    } catch (error) {
      console.error('商品別顧客リストの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  };

  // 商品一覧の取得
  React.useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await apiClient.get('/api/products');
        setProducts(res.data.map((p: any) => ({ id: p.id, name: p.product_name })));
      } catch (error) {
        console.error('商品一覧の取得に失敗しました:', error);
      }
    };
    fetchProducts();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        各種分析リスト
      </Typography>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="売上・粗利分析" />
        <Tab label="顧客推移分析" />
        <Tab label="商品別顧客リスト" />
      </Tabs>

      {/* 売上・粗利分析タブ */}
      <TabPanel value={tabValue} index={0}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              売上・粗利分析
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              任意期間の売上および粗利を確認できます。合計と月ごとの内訳を表示します。
            </Alert>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <LocalizationProvider dateAdapter={AdapterMoment}>
                  <DatePicker
                    label="開始日"
                    value={salesStartDate ? moment(salesStartDate) : null}
                    onChange={(newValue) => setSalesStartDate(newValue ? newValue.toDate() : null)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} md={4}>
                <LocalizationProvider dateAdapter={AdapterMoment}>
                  <DatePicker
                    label="終了日"
                    value={salesEndDate ? moment(salesEndDate) : null}
                    onChange={(newValue) => setSalesEndDate(newValue ? newValue.toDate() : null)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} md={4}>
                <Button
                  variant="contained"
                  onClick={fetchSalesData}
                  disabled={loading || !salesStartDate || !salesEndDate}
                  fullWidth
                  sx={{ height: '56px' }}
                >
                  {loading ? <CircularProgress size={24} /> : '分析実行'}
                </Button>
              </Grid>
            </Grid>

            {salesData && (
              <Box sx={{ mb: 4 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          期間合計売上
                        </Typography>
                        <Typography variant="h4" sx={{ color: '#1976d2' }}>
                          {formatCurrency(salesData.totalSales)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          期間合計粗利
                        </Typography>
                        <Typography variant="h4" sx={{ color: '#388e3c' }}>
                          {formatCurrency(salesData.totalGrossProfit)}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                          粗利率: {((salesData.totalGrossProfit / salesData.totalSales) * 100).toFixed(1)}%
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            )}

            {salesData && salesData.monthlyData.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  月別内訳
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>年月</TableCell>
                        <TableCell align="right">売上</TableCell>
                        <TableCell align="right">原価</TableCell>
                        <TableCell align="right">粗利</TableCell>
                        <TableCell align="right">粗利率</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {salesData.monthlyData.map((month) => (
                        <TableRow key={`${month.year}-${month.month}`}>
                          <TableCell>{month.year}年{month.month}月</TableCell>
                          <TableCell align="right">{formatCurrency(month.sales)}</TableCell>
                          <TableCell align="right">{formatCurrency(month.cost || Math.max(0, month.sales - month.grossProfit))}</TableCell>
                          <TableCell align="right">{formatCurrency(month.grossProfit)}</TableCell>
                          <TableCell align="right">{month.sales > 0 ? ((month.grossProfit / month.sales) * 100).toFixed(1) : 0}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {productSalesData.length > 0 && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  商品別売上・粗利
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>商品名</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell align="right">売上</TableCell>
                        <TableCell align="right">原価</TableCell>
                        <TableCell align="right">粗利</TableCell>
                        <TableCell align="right">粗利率</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {productSalesData.map((product) => (
                        <TableRow key={product.productId}>
                          <TableCell>{product.productName}</TableCell>
                          <TableCell align="right">{product.quantity}</TableCell>
                          <TableCell align="right">{formatCurrency(product.sales)}</TableCell>
                          <TableCell align="right">{formatCurrency(product.cost ?? 0)}</TableCell>
                          <TableCell align="right">{formatCurrency(product.grossProfit)}</TableCell>
                          <TableCell align="right">
                            {product.sales > 0 ? ((product.grossProfit / product.sales) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {courseSalesData.length > 0 && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  コース別売上・粗利
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>コース名</TableCell>
                        <TableCell align="right">顧客数</TableCell>
                        <TableCell align="right">売上</TableCell>
                        <TableCell align="right">原価</TableCell>
                        <TableCell align="right">粗利</TableCell>
                        <TableCell align="right">粗利率</TableCell>
                        <TableCell align="right">顧客単価</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {courseSalesData.map((course) => (
                        <TableRow key={course.courseId}>
                          <TableCell>{course.courseName}</TableCell>
                          <TableCell align="right">{course.customerCount}</TableCell>
                          <TableCell align="right">{formatCurrency(course.sales)}</TableCell>
                          <TableCell align="right">{formatCurrency(course.cost || Math.max(0, course.sales - course.grossProfit))}</TableCell>
                          <TableCell align="right">{formatCurrency(course.grossProfit)}</TableCell>
                          <TableCell align="right">{course.sales > 0 ? ((course.grossProfit / course.sales) * 100).toFixed(1) : 0}%</TableCell>
                          <TableCell align="right">
                            {course.customerCount > 0
                              ? formatCurrency(course.sales / course.customerCount)
                              : formatCurrency(0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* 顧客推移分析タブ */}
      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              顧客推移分析
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              指定月の新規顧客と解約客を確認できます。
            </Alert>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="対象月"
                  type="month"
                  value={customerMonth}
                  onChange={(e) => setCustomerMonth(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Button
                  variant="contained"
                  onClick={fetchCustomerChanges}
                  disabled={loading || !customerMonth}
                  fullWidth
                  sx={{ height: '56px' }}
                >
                  {loading ? <CircularProgress size={24} /> : '分析実行'}
                </Button>
              </Grid>
            </Grid>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      新規顧客 ({newCustomers.length}件)
                    </Typography>
                    {newCustomers.length > 0 ? (
                      <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>顧客ID</TableCell>
                              <TableCell>顧客名</TableCell>
                              <TableCell>コース</TableCell>
                              <TableCell>契約開始日</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {newCustomers.map((customer) => (
                              <TableRow key={customer.id}>
                                <TableCell>{customer.customId}</TableCell>
                                <TableCell>{customer.customerName}</TableCell>
                                <TableCell>{customer.courseName || '-'}</TableCell>
                                <TableCell>{customer.contractStartDate}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        新規顧客はありません
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      解約客 ({cancelledCustomers.length}件)
                    </Typography>
                    {cancelledCustomers.length > 0 ? (
                      <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>顧客ID</TableCell>
                              <TableCell>顧客名</TableCell>
                              <TableCell>コース</TableCell>
                              <TableCell>契約終了日</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {cancelledCustomers.map((customer) => (
                              <TableRow key={customer.id}>
                                <TableCell>{customer.customId}</TableCell>
                                <TableCell>{customer.customerName}</TableCell>
                                <TableCell>{customer.courseName || '-'}</TableCell>
                                <TableCell>{customer.contractEndDate}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        解約客はありません
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 商品別顧客リストタブ */}
      <TabPanel value={tabValue} index={2}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              商品別顧客リスト
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              指定した商品を配達している顧客の一覧を表示します。
            </Alert>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>商品</InputLabel>
                  <Select
                    value={selectedProductId}
                    label="商品"
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>商品を選択してください</em>
                    </MenuItem>
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <Button
                  variant="contained"
                  onClick={fetchProductCustomers}
                  disabled={loading || !selectedProductId}
                  fullWidth
                  sx={{ height: '56px' }}
                >
                  {loading ? <CircularProgress size={24} /> : '検索実行'}
                </Button>
              </Grid>
            </Grid>

            {productCustomers.length > 0 && (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>顧客ID</TableCell>
                      <TableCell>顧客名</TableCell>
                      <TableCell>コース</TableCell>
                      <TableCell align="right">数量</TableCell>
                      <TableCell align="right">合計金額</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {productCustomers.map((customer) => (
                      <TableRow key={customer.customerId}>
                        <TableCell>{customer.customId}</TableCell>
                        <TableCell>{customer.customerName}</TableCell>
                        <TableCell>{customer.courseName || '-'}</TableCell>
                        <TableCell align="right">{customer.quantity}</TableCell>
                        <TableCell align="right">{formatCurrency(customer.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </TabPanel>
    </Box>
  );
};

export default Analyses;

