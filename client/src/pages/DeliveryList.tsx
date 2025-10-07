import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { ChevronLeft, ChevronRight, LocalShipping, Person, Print, GetApp, ExpandMore } from '@mui/icons-material';
import { deliveryService, DeliveryCustomer } from '../services/deliveryService';

// Course型の定義
interface Course {
  id: number;
  custom_id: string;
  course_name: string;
  description?: string;
  created_at: string;
}



// 商品合計表タブのコンポーネント
const ProductSummaryTab: React.FC = () => {
  // 今日の日付を取得してフォーマット（日本標準時）
  const getTodayString = (): string => {
    const today = new Date();
    // 日本標準時（UTC+9）に調整
    const jstOffset = 9 * 60; // 9時間をミリ秒に変換
    const jstTime = new Date(today.getTime() + (jstOffset * 60 * 1000));
    return jstTime.toISOString().split('T')[0];
  };

  // 商品合計表の状態
  const [startDate, setStartDate] = useState<string>(getTodayString());
  const [days, setDays] = useState<number>(1);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('all');
  const [courses, setCourses] = useState<Course[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // ローカルストレージから自動計算設定を読み込み
  const [autoFetch, setAutoFetch] = useState<boolean>(() => {
    const saved = localStorage.getItem('deliveryList_autoFetch');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // 休配反映フラグ（localStorageから復元）
  const [reflectSkips, setReflectSkips] = useState<boolean>(() => {
    const saved = localStorage.getItem('deliveryList_reflectSkips');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // メーカー一覧を取得
  const fetchManufacturers = async () => {
    try {
      const response = await fetch('http://localhost:9000/api/masters/manufacturers');
      if (!response.ok) {
        throw new Error('メーカー一覧の取得に失敗しました');
      }
      const data = await response.json();
      setManufacturers(data);
    } catch (error: any) {
      console.error('メーカー一覧取得エラー:', error);
      setError('メーカー一覧の取得に失敗しました。');
    }
  };

  // 終了日を計算する関数
  const calculateEndDate = (start: string, dayCount: number): string => {
    const startDateObj = new Date(start);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + dayCount - 1); // dayCount日分（開始日含む）
    return endDateObj.toISOString().split('T')[0];
  };

  // コース一覧を取得する関数
  const fetchCourses = async () => {
    try {
      const response = await fetch('http://localhost:9000/api/masters/courses');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCourses(data);
    } catch (error: any) {
      console.error('コース一覧の取得エラー:', error);
    }
  };

  // 指定期間・対象顧客の臨時変更（休配等）を取得
  const fetchTemporaryChangesInRange = async (start: string, end: string, customerIds: number[]) => {
    try {
      const allChanges: any[] = [];
      for (const cid of customerIds) {
        const res = await fetch(`http://localhost:9000/api/temporary-changes/customer/${cid}/period/${start}/${end}`);
        if (!res.ok) {
          throw new Error(`顧客ID ${cid} の臨時変更取得に失敗しました`);
        }
        const rows = await res.json();
        if (Array.isArray(rows)) {
          allChanges.push(...rows);
        }
      }
      return allChanges;
    } catch (e) {
      console.warn('臨時変更データの取得に失敗しました。休配反映はスキップされます:', e);
      return [];
    }
  };

  // 休配判定用のヘルパー
  const buildSkipMap = (changes: any[]) => {
    const map = new Map<string, Set<string>>();
    changes.filter(c => c.change_type === 'skip').forEach((c: any) => {
      const key = `${c.change_date}-${c.customer_id}`;
      const set = map.get(key) || new Set<string>();
      if (c.product_id && Number.isFinite(Number(c.product_id))) {
        set.add(String(c.product_id));
      } else {
        set.add('ALL');
      }
      map.set(key, set);
    });
    return map;
  };

  const isSkipped = (skipMap: Map<string, Set<string>>, date: string, customerId: number, productId?: number) => {
    const key = `${date}-${customerId}`;
    const set = skipMap.get(key);
    if (!set) return false;
    if (set.has('ALL')) return true;
    if (productId !== undefined && set.has(String(productId))) return true;
    return false;
  };

  // 商品合計データを取得
  const fetchSummaryData = async () => {
    if (!startDate || days <= 0) return;

    setLoading(true);
    setError(null);
    try {
      const endDate = calculateEndDate(startDate, days);
      const manufacturerParam = selectedManufacturer === 'all' ? '' : `&manufacturer=${selectedManufacturer}`;
      
      // コース別表示モードかどうかで使用するAPIエンドポイントを切り替え
      if (!reflectSkips) {
        if (selectedCourse === 'all-by-course') {
          const response = await fetch(`http://localhost:9000/api/delivery/products/summary-by-course?startDate=${startDate}&endDate=${endDate}${manufacturerParam}`);
          if (!response.ok) throw new Error('コース別商品合計データの取得に失敗しました');
          const data = await response.json();
          const formattedData = {
            startDate: data.startDate,
            endDate: data.endDate,
            days: days,
            course: 'all-by-course',
            manufacturer: data.manufacturer,
            courses: data.courses || [],
            total_quantity: data.overall_summary?.total_quantity || 0,
            total_amount: data.overall_summary?.total_amount || 0,
            isByCourse: true
          };
          setSummaryData(formattedData);
        } else {
          const courseParam = selectedCourse === 'all' ? '' : `&courseId=${selectedCourse}`;
          const response = await fetch(`http://localhost:9000/api/delivery/products/summary?startDate=${startDate}&endDate=${endDate}${courseParam}${manufacturerParam}`);
          if (!response.ok) throw new Error('商品合計データの取得に失敗しました');
          const data = await response.json();
          const formattedData = {
            startDate: data.startDate,
            endDate: data.endDate,
            days: days,
            course: data.courseId,
            manufacturer: data.manufacturer,
            products: data.products || [],
            total_quantity: data.summary?.total_quantity || 0,
            total_amount: data.summary?.total_amount || 0,
            isByCourse: false
          };
          setSummaryData(formattedData);
        }
      } else {
        const courseParam = selectedCourse === 'all' || selectedCourse === 'all-by-course' ? '' : `&courseId=${selectedCourse}`;
        const periodRes = await fetch(`http://localhost:9000/api/delivery/period?startDate=${startDate}&endDate=${endDate}${courseParam}`);
        if (!periodRes.ok) throw new Error('配達データの取得に失敗しました');
        const periodData = await periodRes.json();
        const deliveriesByCourse = periodData.deliveries || {};
        // 期間内に含まれる顧客ID一覧を抽出
        const customerIdSet = new Set<number>();
        Object.values(deliveriesByCourse).forEach((courseData: any) => {
          const dayArrays = Object.values(courseData) as any[];
          dayArrays.forEach((dayData: any) => {
            const customers = dayData as any[];
            customers.forEach((customer: any) => {
              if (customer && typeof customer.customer_id === 'number') {
                customerIdSet.add(customer.customer_id);
              }
            });
          });
        });
        const changes = await fetchTemporaryChangesInRange(startDate, endDate, Array.from(customerIdSet));
        const skipMap = buildSkipMap(changes);

        const aggregateAll = selectedCourse !== 'all-by-course';
        const manufacturerFilter = selectedManufacturer === 'all' ? null : String(selectedManufacturer);
        const overallSummary = { total_quantity: 0, total_amount: 0 };

        if (aggregateAll) {
          const productAgg = new Map<string, { product_name: string; manufacturer_name: string; unit: string; total_quantity: number; total_amount: number }>();
          Object.entries(deliveriesByCourse).forEach(([courseName, courseData]: [string, any]) => {
            Object.entries(courseData).forEach(([date, customers]: [string, any]) => {
              customers.forEach((customer: any) => {
                (customer.products || []).forEach((product: any) => {
                  // メーカー絞り込みはサーバーのperiodレスポンスにメーカーIDが含まれていないため保留
                  // （必要であれば別APIで製品→メーカー紐付けを取得してフィルタリングする）
                  const skipped = isSkipped(skipMap, date, customer.customer_id, product.product_id);
                  const qty = skipped ? 0 : (product.quantity || 0);
                  const amount = skipped ? 0 : (product.amount || 0);
                  const key = `${product.product_id}`;
                  const prev = productAgg.get(key) || { product_name: product.product_name, manufacturer_name: product.manufacturer_name || '', unit: product.unit, total_quantity: 0, total_amount: 0 };
                  prev.total_quantity += qty;
                  prev.total_amount += amount;
                  productAgg.set(key, prev);
                  overallSummary.total_quantity += qty;
                  overallSummary.total_amount += amount;
                });
              });
            });
          });
          const products = Array.from(productAgg.values());
          setSummaryData({
            startDate,
            endDate,
            days,
            course: selectedCourse,
            manufacturer: selectedManufacturer,
            products,
            total_quantity: overallSummary.total_quantity,
            total_amount: overallSummary.total_amount,
            isByCourse: false
          });
        } else {
          const coursesArr: any[] = [];
          let overallQty = 0;
          let overallAmt = 0;
          Object.entries(deliveriesByCourse).forEach(([courseName, courseData]: [string, any]) => {
            const productAgg = new Map<string, { product_name: string; manufacturer_name: string; unit: string; total_quantity: number; total_amount: number }>();
            Object.entries(courseData).forEach(([date, customers]: [string, any]) => {
              customers.forEach((customer: any) => {
                (customer.products || []).forEach((product: any) => {
                  // メーカー絞り込みはサーバーのperiodレスポンスにメーカーIDが含まれていないため保留
                  const skipped = isSkipped(skipMap, date, customer.customer_id, product.product_id);
                  const qty = skipped ? 0 : (product.quantity || 0);
                  const amount = skipped ? 0 : (product.amount || 0);
                  const key = `${product.product_id}`;
                  const prev = productAgg.get(key) || { product_name: product.product_name, manufacturer_name: product.manufacturer_name || '', unit: product.unit, total_quantity: 0, total_amount: 0 };
                  prev.total_quantity += qty;
                  prev.total_amount += amount;
                  productAgg.set(key, prev);
                });
              });
            });
            const products = Array.from(productAgg.values());
            const courseTotalQty = products.reduce((sum, p) => sum + p.total_quantity, 0);
            const courseTotalAmt = products.reduce((sum, p) => sum + p.total_amount, 0);
            overallQty += courseTotalQty;
            overallAmt += courseTotalAmt;
            coursesArr.push({
              course_id: null,
              course_name: courseName,
              products,
              summary: { total_quantity: courseTotalQty, total_amount: courseTotalAmt }
            });
          });
          setSummaryData({
            startDate,
            endDate,
            days,
            course: 'all-by-course',
            manufacturer: selectedManufacturer,
            courses: coursesArr,
            total_quantity: overallQty,
            total_amount: overallAmt,
            isByCourse: true
          });
        }
      }
    } catch (error: any) {
      console.error('商品合計データの取得エラー:', error);
      setError('商品合計データの取得に失敗しました。');
      setSummaryData(null);
    } finally {
      setLoading(false);
    }
  };

  // 手動集計ボタンのハンドラー
  const handleManualFetch = () => {
    fetchSummaryData();
  };

  // autoFetchの状態をローカルストレージに保存
  useEffect(() => {
    localStorage.setItem('deliveryList_autoFetch', JSON.stringify(autoFetch));
  }, [autoFetch]);

  // 初回読み込み（自動取得が有効な場合のみ）
  useEffect(() => {
    fetchCourses(); // コース一覧を取得
    fetchManufacturers(); // メーカー一覧を取得
    if (autoFetch) {
      fetchSummaryData();
    }
  }, [startDate, days, selectedCourse, selectedManufacturer, autoFetch, reflectSkips]);

  // 今日の日付に設定
  const handleToday = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(1);
  };

  // 期間を1週間に設定
  const handleWeek = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(7);
  };

  // 開始日変更時の処理
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  // 日数変更時の処理
  const handleDaysChange = (value: number) => {
    if (value > 0 && value <= 365) { // 1日以上365日以下の制限
      setDays(value);
    }
  };

  // コース変更時の処理
  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
  };

  // メーカー変更時の処理
  const handleManufacturerChange = (value: string) => {
    setSelectedManufacturer(value);
  };

  // 金額をフォーマット
  const formatCurrency = (amount: number): string => {
    return `¥${amount.toLocaleString()}`;
  };

  // 期間表示用のフォーマット
  const formatPeriod = (): string => {
    if (days === 1) {
      return new Date(startDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    } else {
      const endDate = calculateEndDate(startDate, days);
      return `${new Date(startDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })} ～ ${new Date(endDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })} (${days}日間)`;
    }
  };

  return (
    <Box>
      {/* 期間・フィルター選択 */}
      <Grid container spacing={2} sx={{ mb: 3 }} className="print-header-hide">
        {/* 期間設定 */}
        <Grid item xs={12} md={8}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="開始日"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            
            <TextField
              label="日数"
              type="number"
              value={days}
              onChange={(e) => handleDaysChange(parseInt(e.target.value) || 1)}
              inputProps={{ min: 1, max: 365 }}
              sx={{ width: 100 }}
            />
            
            <Button 
              variant="outlined" 
              onClick={handleToday}
              size="small"
            >
              今日
            </Button>
            
            <Button 
              variant="outlined" 
              onClick={handleWeek}
              size="small"
            >
              1週間
            </Button>
          </Box>
        </Grid>

        {/* 自動/手動切り替えと集計ボタン */}
        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={autoFetch}
                  onChange={(e) => setAutoFetch(e.target.checked)}
                  size="small"
                />
              }
              label="自動集計"
              sx={{ mr: 1 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={reflectSkips}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setReflectSkips(v);
                    localStorage.setItem('deliveryList_reflectSkips', JSON.stringify(v));
                  }}
                  size="small"
                />
              }
              label="休配反映"
              sx={{ mr: 1 }}
            />
            <Button
              variant="contained"
              onClick={handleManualFetch}
              disabled={loading || autoFetch}
              size="small"
            >
              手動集計
            </Button>
          </Box>
        </Grid>

        {/* フィルター設定 */}
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel>配達コース</InputLabel>
            <Select
              value={selectedCourse}
              label="配達コース"
              onChange={(e) => handleCourseChange(e.target.value)}
            >
              <MenuItem value="all">全コース（合計）</MenuItem>
              <MenuItem value="all-by-course">全コース（コース別）</MenuItem>
              {courses.map((course) => (
                <MenuItem key={course.id} value={course.id.toString()}>
                  {course.course_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel>メーカー</InputLabel>
            <Select
              value={selectedManufacturer}
              label="メーカー"
              onChange={(e) => handleManufacturerChange(e.target.value)}
            >
              <MenuItem value="all">全メーカー</MenuItem>
              {manufacturers.map((manufacturer) => (
                <MenuItem key={manufacturer.id} value={manufacturer.id}>
                  {manufacturer.manufacturer_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* 印刷・出力ボタン */}
        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Print />}
              disabled={!summaryData}
              fullWidth
              onClick={() => window.print()}
            >
              印刷
            </Button>
            <Button
              variant="outlined"
              startIcon={<GetApp />}
              disabled={!summaryData}
              fullWidth
            >
              CSV出力
            </Button>
          </Box>
        </Grid>

        {/* 期間表示 */}
        <Grid item xs={12}>
          <Typography variant="h6" sx={{ textAlign: 'center', color: 'primary.main' }}>
            {formatPeriod()}
          </Typography>
        </Grid>
      </Grid>

      {/* ローディング表示 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* エラー表示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 商品合計データ表示 */}
      {!loading && !error && summaryData && (
        <>
          {/* サマリーカード */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6} className="print-hide-amount">
              <Card className="print-summary-compact">
                <CardContent sx={{ textAlign: 'center' }}>
                  <LocalShipping color="primary" sx={{ fontSize: 40, mb: 1 }} />
                  <Typography variant="h6" color="primary">
                    総商品数
                  </Typography>
                  <Typography variant="h4">
                    {summaryData.total_quantity}個
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6} className="print-hide-amount">
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Typography 
                    variant="h2" 
                    color="primary" 
                    sx={{ 
                      fontSize: 40, 
                      mb: 1, 
                      fontWeight: 'bold',
                      lineHeight: 1
                    }}
                  >
                    ¥
                  </Typography>
                  <Typography variant="h6" color="primary">
                    合計金額
                  </Typography>
                  <Typography variant="h4">
                    {formatCurrency(summaryData.total_amount)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* 商品合計テーブル */}
          {summaryData.isByCourse ? (
            // コース別表示モード
            summaryData.courses.map((course: any, courseIndex: number) => (
              <Box key={course.course_id} sx={{ mb: 4 }} className={courseIndex === 0 ? "" : "print-page-break"}>
                <Typography variant="h5" sx={{ mb: 2, color: 'primary.main' }}>
                  {course.course_name}
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>商品名</TableCell>
                        <TableCell>メーカー</TableCell>
                        <TableCell>単位</TableCell>
                        <TableCell align="right">合計数量</TableCell>
                        <TableCell align="right" className="print-hide-amount">合計金額</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {course.products.map((product: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{product.product_name}</TableCell>
                          <TableCell>{product.manufacturer_name}</TableCell>
                          <TableCell>{product.unit}</TableCell>
                          <TableCell align="right">{product.total_quantity}</TableCell>
                          <TableCell align="right" className="print-hide-amount">{formatCurrency(product.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                        <TableCell colSpan={3} sx={{ fontWeight: 'bold', '@media print': { colSpan: 3 } }}>合計</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {course.summary.total_quantity}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }} className="print-hide-amount">
                          {formatCurrency(course.summary.total_amount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))
          ) : (
            // 通常表示モード
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>商品名</TableCell>
                    <TableCell>メーカー</TableCell>
                    <TableCell>単位</TableCell>
                    <TableCell align="right">合計数量</TableCell>
                    <TableCell align="right" className="print-hide-amount">合計金額</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summaryData.products.map((product: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{product.product_name}</TableCell>
                      <TableCell>{product.manufacturer_name}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell align="right">{product.total_quantity}</TableCell>
                      <TableCell align="right" className="print-hide-amount">{formatCurrency(product.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 'bold', '@media print': { colSpan: 3 } }}>合計</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {summaryData.total_quantity}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }} className="print-hide-amount">
                      {formatCurrency(summaryData.total_amount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
};

// 期間別・コース別配達リストタブのコンポーネント
const PeriodDeliveryListTab: React.FC = () => {
  // 今日の日付を取得してフォーマット（日本標準時）
  const getTodayString = (): string => {
    const today = new Date();
    // 日本標準時（UTC+9）に調整
    const jstOffset = 9 * 60; // 9時間をミリ秒に変換
    const jstTime = new Date(today.getTime() + (jstOffset * 60 * 1000));
    return jstTime.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(getTodayString());
  const [days, setDays] = useState<number>(1); // 終了日の代わりに日数
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [courses, setCourses] = useState<Course[]>([]);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [deliverySummary, setDeliverySummary] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [skipMap, setSkipMap] = useState<Map<string, Set<string>>>(new Map());
  // ローカルストレージから自動計算設定を読み込み（配達リストタブ用）
  const [autoFetch, setAutoFetch] = useState<boolean>(() => {
    const saved = localStorage.getItem('deliveryListTab_autoFetch');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // シンプル表示フラグ（localStorageから復元）
  const [isSimpleDisplay, setIsSimpleDisplay] = useState<boolean>(() => {
    const saved = localStorage.getItem('deliveryList_simpleDisplay');
    return saved ? JSON.parse(saved) : false;
  });

  // 終了日を計算する関数
  const calculateEndDate = (start: string, dayCount: number): string => {
    const startDateObj = new Date(start);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + dayCount - 1); // dayCount日分（開始日含む）
    return endDateObj.toISOString().split('T')[0];
  };

  // コース一覧を取得する関数
  const fetchCourses = async () => {
    try {
      const response = await fetch('http://localhost:9000/api/masters/courses');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCourses(data);
    } catch (error: any) {
      console.error('コース一覧の取得エラー:', error);
    }
  };

  // 臨時変更を取得（期間・顧客ごと）
  const fetchTemporaryChangesInRange = async (start: string, end: string, customerIds: number[]) => {
    try {
      const changes: any[] = [];
      for (const cid of customerIds) {
        const res = await fetch(`http://localhost:9000/api/temporary-changes/customer/${cid}/period/${start}/${end}`);
        if (!res.ok) {
          throw new Error(`顧客ID ${cid} の臨時変更取得に失敗しました`);
        }
        const rows = await res.json();
        if (Array.isArray(rows)) {
          changes.push(...rows);
        }
      }
      return changes;
    } catch (e) {
      console.warn('臨時変更データの取得に失敗しました。休配反映はスキップされます:', e);
      return [];
    }
  };

  const buildSkipMap = (changes: any[]) => {
    const map = new Map<string, Set<string>>();
    changes.filter(c => c.change_type === 'skip').forEach((c: any) => {
      const key = `${c.change_date}-${c.customer_id}`;
      const set = map.get(key) || new Set<string>();
      if (c.product_id && Number.isFinite(Number(c.product_id))) {
        set.add(String(c.product_id));
      } else {
        set.add('ALL');
      }
      map.set(key, set);
    });
    return map;
  };

  const isSkipped = (date: string, customerId: number, productId?: number) => {
    const key = `${date}-${customerId}`;
    const set = skipMap.get(key);
    if (!set) return false;
    if (set.has('ALL')) return true;
    if (productId !== undefined && set.has(String(productId))) return true;
    return false;
  };

  // 配達データを取得する関数
  const fetchDeliveryData = async () => {
    if (!startDate || days <= 0) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = calculateEndDate(startDate, days);
      const courseParam = selectedCourse === 'all' ? '' : `&courseId=${selectedCourse}`;
      const response = await fetch(`http://localhost:9000/api/delivery/period?startDate=${startDate}&endDate=${endDate}${courseParam}`);
      
      if (!response.ok) {
        throw new Error('配達データの取得に失敗しました');
      }

      const data = await response.json();
      const deliveries = data.deliveries || {};
      setDeliveryData(deliveries);
      // 休配反映用に臨時変更を取得（対象顧客のみ）
      const customerIdSet = new Set<number>();
      Object.values(deliveries).forEach((courseData: any) => {
        const dayArrays = Object.values(courseData) as any[];
        dayArrays.forEach((dayData: any) => {
          const customers = dayData as any[];
          customers.forEach((customer: any) => {
            if (customer && typeof customer.customer_id === 'number') {
              customerIdSet.add(customer.customer_id);
            }
          });
        });
      });
      const changes = await fetchTemporaryChangesInRange(startDate, endDate, Array.from(customerIdSet));
      const newSkipMap = buildSkipMap(changes);
      setSkipMap(newSkipMap);
      // 休配を反映した総数量を再計算
      let totalQty = 0;
      Object.entries(deliveries).forEach(([courseName, courseData]: [string, any]) => {
        Object.entries(courseData).forEach(([date, customers]: [string, any]) => {
          customers.forEach((customer: any) => {
            (customer.products || []).forEach((product: any) => {
              const skipped = (() => {
                const key = `${date}-${customer.customer_id}`;
                const set = newSkipMap.get(key);
                if (!set) return false;
                if (set.has('ALL')) return true;
                return set.has(String(product.product_id));
              })();
              const qty = skipped ? 0 : (product.quantity || 0);
              totalQty += qty;
            });
          });
        });
      });
      setDeliverySummary({ ...data.summary, total_quantity: totalQty });
    } catch (err) {
      console.error('配達データ取得エラー:', err);
      setError(err instanceof Error ? err.message : '配達データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 手動集計ボタンのハンドラー
  const handleManualFetch = () => {
    fetchDeliveryData();
  };

  // autoFetchの状態をローカルストレージに保存（配達リストタブ用）
  useEffect(() => {
    localStorage.setItem('deliveryListTab_autoFetch', JSON.stringify(autoFetch));
  }, [autoFetch]);

  // 初回読み込み（自動取得が有効な場合のみ）
  useEffect(() => {
    fetchCourses(); // コース一覧を取得
    if (autoFetch) {
      fetchDeliveryData();
    }
  }, [startDate, days, selectedCourse, autoFetch]);

  // 今日の日付に設定
  const handleToday = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(1);
  };

  // 期間を1週間に設定
  const handleWeek = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(7);
  };

  // 日付変更時の処理
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  // 日数変更時の処理
  const handleDaysChange = (value: number) => {
    if (value > 0 && value <= 365) { // 1日以上365日以下の制限
      setDays(value);
    }
  };

  // コース変更時の処理
  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
  };

  return (
    <Box>
      {/* 期間・コース選択 */}
      <Card sx={{ mb: 3 }} className="print-header-hide">
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                label="開始日"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="日数"
                type="number"
                value={days}
                onChange={(e) => handleDaysChange(parseInt(e.target.value) || 1)}
                fullWidth
                inputProps={{ min: 1, max: 365 }}
                helperText="1〜365日"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>配達コース</InputLabel>
                <Select
                  value={selectedCourse}
                  label="配達コース"
                  onChange={(e) => handleCourseChange(e.target.value)}
                >
                  <MenuItem value="all">全コース（合計）</MenuItem>
                  <MenuItem value="all-by-course">全コース（コース別）</MenuItem>
                  {courses && courses.length > 0 ? courses.map((course) => (
                    <MenuItem key={course.id} value={course.id?.toString() || ''}>
                      {course.course_name || `コース${course.id}`}
                    </MenuItem>
                  )) : null}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={handleToday} size="small">
                  今日
                </Button>
                <Button variant="outlined" onClick={handleWeek} size="small">
                  1週間
                </Button>
              </Box>
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            {/* 左側：集計ボタンとシンプル表示チェックボックス */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                onClick={fetchDeliveryData}
                disabled={loading || !startDate || days <= 0}
                startIcon={loading ? <CircularProgress size={20} /> : undefined}
              >
                {loading ? '集計中...' : '集計'}
              </Button>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSimpleDisplay}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setIsSimpleDisplay(newValue);
                      localStorage.setItem('deliveryList_simpleDisplay', JSON.stringify(newValue));
                    }}
                    size="small"
                  />
                }
                label="シンプル表示"
                sx={{ ml: 1 }}
              />
            </Box>

            {/* 右側：出力ボタン */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<Print />}
                disabled={!deliveryData || Object.keys(deliveryData).length === 0}
                onClick={() => window.print()}
              >
                印刷
              </Button>
              <Button
                variant="outlined"
                startIcon={<GetApp />}
                disabled={!deliveryData || Object.keys(deliveryData).length === 0}
              >
                CSV出力
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ローディング表示 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* エラー表示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 配達データ表示 */}
      {!loading && !error && deliveryData && Object.keys(deliveryData).length > 0 && (
        <>
          {/* 期間表示 */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            配達期間: {startDate} ～ {calculateEndDate(startDate, days)} ({days}日間)
          </Typography>

          {/* 統計情報 */}
          {deliverySummary && (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                総顧客数: {(() => {
                  // 全コースの全日付からユニークな顧客IDを抽出
                  const allUniqueCustomers = new Set();
                  Object.values(deliveryData).forEach((courseData: any) => {
                    Object.values(courseData).forEach((dayData: any) => {
                      dayData.forEach((customer: any) => {
                        allUniqueCustomers.add(customer.customer_id);
                      });
                    });
                  });
                  return allUniqueCustomers.size;
                })()}件 | 
                総数量: {deliverySummary.total_quantity}
              </Typography>
            </Box>
          )}

          {/* コース別配達リスト */}
          {Object.keys(deliveryData).length > 0 ? (
            Object.entries(deliveryData).map(([courseName, courseData]: [string, any]) => {
              // コース内のユニークな顧客数を計算
              const uniqueCustomers = new Set();
              Object.values(courseData).forEach((dayData: any) => {
                dayData.forEach((customer: any) => {
                  uniqueCustomers.add(customer.customer_id);
                });
              });
              const totalCustomers = uniqueCustomers.size;

              // 全ての日付を取得してソート
              const allDates = Object.keys(courseData).sort();
              
              // 全ての顧客と商品を統合し、顧客×商品ごとに日付別のデータを整理
              const customerProductMap = new Map();
              
              allDates.forEach(date => {
                const customers = courseData[date];
                customers.forEach((customer: any) => {
                  customer.products?.forEach((product: any) => {
                    const key = `${customer.customer_id}-${product.product_id}`;
                    if (!customerProductMap.has(key)) {
                      customerProductMap.set(key, {
                        customer_id: customer.customer_id,
                        customer_name: customer.customer_name,
                        address: customer.address,
                        phone: customer.phone,
                        delivery_order: customer.delivery_order,
                        product_id: product.product_id,
                        product_name: product.product_name,
                        dateQuantities: {}
                      });
                    }
                    
                    const customerProductData = customerProductMap.get(key);
                    customerProductData.dateQuantities[date] = product.quantity;
                  });
                });
              });

              const allCustomerProducts = Array.from(customerProductMap.values()).sort((a, b) => {
                const orderA = a.delivery_order || 999;
                const orderB = b.delivery_order || 999;
                if (orderA !== orderB) return orderA - orderB;
                return a.customer_id - b.customer_id;
              });
              
              return (
                <Accordion key={courseName} defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography variant="h6" color="primary">
                      {courseName} ({totalCustomers}件)
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>配達順</TableCell>
                            <TableCell>ID</TableCell>
                            <TableCell sx={{ minWidth: isSimpleDisplay ? 150 : 120 }}>顧客名</TableCell>
                            {!isSimpleDisplay && <TableCell>住所</TableCell>}
                            {!isSimpleDisplay && <TableCell>電話番号</TableCell>}
                            <TableCell sx={{ minWidth: isSimpleDisplay ? 120 : 100 }}>商品名</TableCell>
                            {allDates.map(date => (
                              <TableCell key={date} align="center" sx={{ minWidth: 80 }}>
                                {date}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {allCustomerProducts.map((customerProduct: any, index: number) => {
                            // 同じ顧客の最初の商品かどうかを判定
                            const isFirstProductForCustomer = index === 0 || 
                              allCustomerProducts[index - 1].customer_id !== customerProduct.customer_id;
                            
                            return (
                              <TableRow key={`${customerProduct.customer_id}-${customerProduct.product_id}`}>
                                <TableCell>
                                  {isFirstProductForCustomer ? (customerProduct.delivery_order || '-') : ''}
                                </TableCell>
                                <TableCell>
                                  {isFirstProductForCustomer ? customerProduct.customer_id : ''}
                                </TableCell>
                                <TableCell sx={{ fontWeight: isSimpleDisplay ? 'bold' : 'normal' }}>
                                  {isFirstProductForCustomer ? customerProduct.customer_name : ''}
                                </TableCell>
                                {!isSimpleDisplay && (
                                  <TableCell>
                                    {isFirstProductForCustomer ? customerProduct.address : ''}
                                  </TableCell>
                                )}
                                {!isSimpleDisplay && (
                                  <TableCell>
                                    {isFirstProductForCustomer ? customerProduct.phone : ''}
                                  </TableCell>
                                )}
                                <TableCell sx={{ fontWeight: isSimpleDisplay ? 'bold' : 'normal' }}>
                                  {customerProduct.product_name}
                                </TableCell>
                                {allDates.map(date => {
                                  const quantity = customerProduct.dateQuantities[date];
                                  const skipped = isSkipped(date, customerProduct.customer_id, customerProduct.product_id);
                                  return (
                                    <TableCell key={date} align="center">
                                      {skipped ? (
                                        <Chip label="休" size="small" sx={{ bgcolor: '#ffebee', color: 'red', border: '1px solid #ffcdd2' }} />
                                      ) : quantity ? (
                                        <Typography variant="body2" fontWeight="bold">
                                          {quantity}
                                        </Typography>
                                      ) : (
                                        <Typography variant="body2" color="text.disabled">
                                          -
                                        </Typography>
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              );
            })
          ) : (
            <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
              <LocalShipping sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                指定された期間・コースの配達予定はありません
              </Typography>
            </Paper>
          )}
        </>
      )}

      {/* データが未取得の場合の表示 */}
      {!loading && !error && !deliveryData && (
        <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            期間とコースを選択して「集計」ボタンをクリックしてください
          </Typography>
          <Typography variant="body2" color="text.secondary">
            配達リストを表示するには集計処理が必要です
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

// ... existing code ...

// メインコンポーネント
const DeliveryList: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      {/* ヘッダー部分 */}
      <Box sx={{ mb: 3 }} className="print-header-hide">
        <Typography variant="h4" component="h1" gutterBottom>
          各種帳票出力
        </Typography>
        <Typography variant="body1" color="textSecondary">
          配達リストや商品合計表などの各種帳票を出力できます
        </Typography>
      </Box>

      {/* タブ */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }} className="print-header-hide">
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="期間別配達リスト" />
          <Tab label="商品合計表" />
        </Tabs>
      </Box>

      {/* タブコンテンツ */}
      {tabValue === 0 && <PeriodDeliveryListTab />}
      {tabValue === 1 && <ProductSummaryTab />}
    </Box>
  );
};

export default DeliveryList;