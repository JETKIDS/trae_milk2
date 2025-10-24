import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
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
  FormControlLabel,
  Link
} from '@mui/material';
import { LocalShipping, Print, GetApp, ExpandMore } from '@mui/icons-material';
import { pad7 } from '../utils/id';

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
  const fetchManufacturers = useCallback(async () => {
    try {
      const response = await fetch('/api/masters/manufacturers');
      if (!response.ok) {
        throw new Error('メーカー一覧の取得に失敗しました');
      }
      const data = await response.json();
      setManufacturers(data);
    } catch (error: any) {
      console.error('メーカー一覧取得エラー:', error);
      setError('メーカー一覧の取得に失敗しました。');
    }
  }, []);

  // 終了日を計算する関数
  const calculateEndDate = useCallback((start: string, dayCount: number): string => {
    const startDateObj = new Date(start);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + dayCount - 1); // dayCount日分（開始日含む）
    return endDateObj.toISOString().split('T')[0];
  }, []);

  // コース一覧を取得する関数
  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch('/api/masters/courses');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCourses(data);
    } catch (error: any) {
      console.error('コース一覧の取得エラー:', error);
    }
  }, []);

  // 指定期間・対象顧客の臨時変更（休配等）を取得（タイムアウト・並列制御あり）
  const fetchTemporaryChangesInRange = async (start: string, end: string, customerIds: number[]) => {
    try {
      const allChanges: any[] = [];
      const batchSize = 10; // 過負荷を避けるため最大10件ずつ取得
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize);
        const requests = batch.map((cid) => (
          axios.get(`/api/temporary-changes/customer/${cid}/period/${start}/${end}`)
            .then((res) => Array.isArray(res.data) ? res.data : [])
            .catch((err) => {
              console.warn(`顧客ID ${cid} の臨時変更取得に失敗しました`, err);
              return [];
            })
        ));
        const results = await Promise.allSettled(requests);
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            allChanges.push(...r.value);
          }
        });
      }
      return allChanges;
    } catch (e) {
      console.warn('臨時変更データの取得で予期せぬエラー。休配反映はスキップされます:', e);
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
  const fetchSummaryData = useCallback(async () => {
    if (!startDate || days <= 0) return;

    setLoading(true);
    setError(null);
    try {
      const endDate = calculateEndDate(startDate, days);
      const manufacturerParam = selectedManufacturer === 'all' ? '' : `&manufacturer=${selectedManufacturer}`;
      
      // コース別表示モードかどうかで使用するAPIエンドポイントを切り替え
      if (!reflectSkips) {
        if (selectedCourse === 'all-by-course') {
          const response = await fetch(`/api/delivery/products/summary-by-course?startDate=${startDate}&endDate=${endDate}${manufacturerParam}`);
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
          const response = await fetch(`/api/delivery/products/summary?startDate=${startDate}&endDate=${endDate}${courseParam}${manufacturerParam}`);
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
        const periodRes = await fetch(`/api/delivery/period?startDate=${startDate}&endDate=${endDate}${courseParam}`);
        if (!periodRes.ok) throw new Error('配達データの取得に失敗しました');
        const periodData = await periodRes.json();
        const deliveriesByCourse = periodData.deliveries || {};
        // 期間内に含まれる顧客ID一覧を抽出（ベース配達データから）
        const customerIdSet = new Set<number>();
        Object.values(deliveriesByCourse as Record<string, any>).forEach((courseData: any) => {
          const dayArrays = Object.values(courseData as Record<string, any>) as any[];
          dayArrays.forEach((dayData: any) => {
            const customers = dayData as any[];
            customers.forEach((customer: any) => {
              if (customer && typeof customer.customer_id === 'number') {
                customerIdSet.add(customer.customer_id);
              }
            });
          });
        });
        // 選択コースに属する全顧客も対象に含める（期間中に配達がない顧客の臨時追加を拾うため）
        const fetchCustomerIdsBySelection = async (): Promise<number[]> => {
          try {
            if (selectedCourse === 'all' || selectedCourse === 'all-by-course') {
              const res = await fetch('/api/customers');
              if (!res.ok) throw new Error('顧客一覧の取得に失敗しました');
              const rows = await res.json();
              return Array.isArray(rows) ? rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n)) : [];
            } else {
              const res = await fetch(`/api/customers/by-course/${selectedCourse}`);
              if (!res.ok) throw new Error('コース別顧客一覧の取得に失敗しました');
              const rows = await res.json();
              return Array.isArray(rows) ? rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n)) : [];
            }
          } catch (e) {
            console.warn('顧客一覧の取得に失敗しました（臨時変更の対象拡張は一部スキップされます）:', e);
            return [];
          }
        };
        const extraIds = await fetchCustomerIdsBySelection();
        extraIds.forEach(id => customerIdSet.add(id));
        const changes = await fetchTemporaryChangesInRange(startDate, endDate, Array.from(customerIdSet));
        const skipMap = buildSkipMap(changes);

        // 臨時追加・本数変更の反映（商品合計の再計算用に、deliveriesByCourseへ反映）
        const addMap = new Map<string, any[]>();
        const modifyMap = new Map<string, any[]>();
        changes.forEach((c: any) => {
          const key = `${c.change_date}-${c.customer_id}`;
          if (c.change_type === 'add') {
            const arr = addMap.get(key) || [];
            arr.push(c);
            addMap.set(key, arr);
          } else if (c.change_type === 'modify') {
            const arr = modifyMap.get(key) || [];
            arr.push(c);
            modifyMap.set(key, arr);
          }
        });

        const findCourseNameForCustomer = (custId: number): string | null => {
          for (const [courseName, courseData] of Object.entries(deliveriesByCourse as Record<string, any>)) {
            const dayArrays = Object.values(courseData as Record<string, any>) as any[];
            for (const dayData of dayArrays) {
              const customers = dayData as any[];
              for (const customer of customers) {
                if (customer && customer.customer_id === custId) return courseName;
              }
            }
          }
          return null;
        };

        const getCourseNameForCustomerByApi = async (custId: number): Promise<string | null> => {
          try {
            const res = await fetch(`/api/customers/${custId}`);
            if (!res.ok) return null;
            const json = await res.json();
            // /api/customers/:id は { customer: { course_name, ... }, patterns: [...] } の形で返却される
            const courseName = (json && json.customer && typeof json.customer.course_name === 'string')
              ? json.customer.course_name
              : (typeof json?.course_name === 'string' ? json.course_name : null);
            return courseName || null;
          } catch {
            return null;
          }
        };

        const getExistingCustomerSample = (courseName: string, custId: number): any | null => {
          const courseData: any = (deliveriesByCourse as any)[courseName];
          if (!courseData) return null;
          const dayArrays = Object.values(courseData as Record<string, any>) as any[];
          for (const dayData of dayArrays) {
            const customers = dayData as any[];
            for (const customer of customers) {
              if (customer && customer.customer_id === custId) return customer;
            }
          }
          return null;
        };

        const ensureCustomerAtDate = (courseName: string, date: string, custId: number): any => {
          const courseData: any = (deliveriesByCourse as any)[courseName] || ((deliveriesByCourse as any)[courseName] = {});
          const customersArr: any[] = courseData[date] || (courseData[date] = []);
          let customer = customersArr.find((c: any) => c.customer_id === custId);
          if (!customer) {
            const sample = getExistingCustomerSample(courseName, custId);
            customer = {
              customer_id: custId,
              customer_name: sample?.customer_name || `顧客${custId}`,
              address: sample?.address || '',
              phone: sample?.phone || '',
              delivery_order: sample?.delivery_order || null,
              products: []
            };
            customersArr.push(customer);
          }
          return customer;
        };

        const ensureProductOnCustomer = (customer: any, change: any) => {
          const pid = Number(change.product_id);
          let product = (customer.products || []).find((p: any) => p.product_id === pid);
          if (!product) {
            product = {
              product_id: pid,
              product_name: change.product_name || `商品${pid}`,
              unit: change.unit || '',
              quantity: 0,
              unit_price: change.unit_price || 0,
              amount: 0,
              manufacturer_id: (change.manufacturer_id !== undefined && change.manufacturer_id !== null) ? Number(change.manufacturer_id) : undefined,
              manufacturer_name: change.manufacturer_name || ''
            };
            customer.products = customer.products || [];
            customer.products.push(product);
          } else {
            // 既存製品にメーカー情報が欠けている場合は補完
            if ((product as any).manufacturer_id === undefined && change.manufacturer_id !== undefined && change.manufacturer_id !== null) {
              (product as any).manufacturer_id = Number(change.manufacturer_id);
            }
            if (!product.manufacturer_name && change.manufacturer_name) {
              product.manufacturer_name = change.manufacturer_name;
            }
          }
          return product;
        };

        const modifyEntries = Array.from(modifyMap.entries());
        for (let i = 0; i < modifyEntries.length; i++) {
          const [key, mods] = modifyEntries[i];
          const sepIdx = key.lastIndexOf('-');
          const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
          const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
          const cid = Number(cidStr);
          let courseName = findCourseNameForCustomer(cid);
          if (!courseName) {
            courseName = await getCourseNameForCustomerByApi(cid);
          }
          if (!courseName) continue;
          const customer = ensureCustomerAtDate(courseName, date, cid);
          mods.forEach((m: any) => {
            const product = ensureProductOnCustomer(customer, m);
            const qty = Number(m.quantity || 0);
            const price = Number(m.unit_price || product.unit_price || 0);
            product.quantity = qty;
            product.unit_price = price;
            product.amount = qty * price;
          });
        }

        const addEntries = Array.from(addMap.entries());
        for (let i = 0; i < addEntries.length; i++) {
          const [key, adds] = addEntries[i];
          const sepIdx = key.lastIndexOf('-');
          const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
          const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
          const cid = Number(cidStr);
          let courseName = findCourseNameForCustomer(cid);
          if (!courseName) {
            courseName = await getCourseNameForCustomerByApi(cid);
          }
          if (!courseName) continue;
          const customer = ensureCustomerAtDate(courseName, date, cid);
          adds.forEach((a: any) => {
            const product = ensureProductOnCustomer(customer, a);
            const qty = Number(a.quantity || 0);
            const price = Number(a.unit_price || product.unit_price || 0);
            product.quantity = qty;
            product.unit_price = price;
            product.amount = qty * price;
          });
        }

        const aggregateAll = selectedCourse !== 'all-by-course';
        const overallSummary = { total_quantity: 0, total_amount: 0 };

        if (aggregateAll) {
          const productAgg = new Map<string, { product_name: string; manufacturer_name: string; unit: string; total_quantity: number; total_amount: number }>();
          Object.entries(deliveriesByCourse).forEach(([courseName, courseData]: [string, any]) => {
            Object.entries(courseData).forEach(([date, customers]: [string, any]) => {
              customers.forEach((customer: any) => {
                (customer.products || []).forEach((product: any) => {
                  // メーカー絞り込みはサーバーのperiodレスポンスにメーカーIDが含まれていないため保留
                  // （必要であれば別APIで製品→メーカー紐付けを取得してフィルタリングする）
                  // 期間APIにメーカー情報を付与したため、メーカー絞り込みを適用
                  const manufacturerFilterActive = selectedManufacturer !== 'all';
                  const matchesManufacturer = !manufacturerFilterActive || String(product.manufacturer_id) === String(selectedManufacturer);
                  if (!matchesManufacturer) {
                    return; // フィルタ対象外のメーカー
                  }
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
                  // 期間APIにメーカー情報を付与したため、メーカー絞り込みを適用
                  const manufacturerFilterActive = selectedManufacturer !== 'all';
                  const matchesManufacturer = !manufacturerFilterActive || String(product.manufacturer_id) === String(selectedManufacturer);
                  if (!matchesManufacturer) {
                    return;
                  }
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
  }, [startDate, days, selectedCourse, selectedManufacturer, reflectSkips, calculateEndDate]);

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
  }, [fetchCourses, fetchManufacturers, fetchSummaryData, autoFetch]);

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
    const [cancelMap, setCancelMap] = useState<Map<string, Set<string>>>(new Map());
    // 解約した商品の商品名などを補完するためのパターンマップ
    const [patternsMap, setPatternsMap] = useState<Map<string, any>>(new Map());
    // 顧客の内部ID（customer_id）と7桁ID（custom_id）の対応表
    const [idToCustomIdMap, setIdToCustomIdMap] = useState<Map<number, string>>(new Map());
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
  const calculateEndDate = useCallback((start: string, dayCount: number): string => {
    const startDateObj = new Date(start);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + dayCount - 1); // dayCount日分（開始日含む）
    return endDateObj.toISOString().split('T')[0];
  }, []);

  // コース一覧を取得する関数
  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch('/api/masters/courses');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCourses(data);
    } catch (error: any) {
      console.error('コース一覧の取得エラー:', error);
    }
  }, []);

  // 臨時変更を取得（期間・顧客ごと、タイムアウト・並列制御あり）
  const fetchTemporaryChangesInRange = async (start: string, end: string, customerIds: number[]) => {
    try {
      const changes: any[] = [];
      const batchSize = 10;
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize);
        const requests = batch.map((cid) => (
          axios.get(`/api/temporary-changes/customer/${cid}/period/${start}/${end}`)
            .then((res) => Array.isArray(res.data) ? res.data : [])
            .catch((err) => {
              console.warn(`顧客ID ${cid} の臨時変更取得に失敗しました`, err);
              return [];
            })
        ));
        const results = await Promise.allSettled(requests);
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            changes.push(...r.value);
          }
        });
      }
      return changes;
    } catch (e) {
      console.warn('臨時変更データの取得で予期せぬエラー。休配反映はスキップされます:', e);
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

  // 顧客ごとの配達パターンを取得（タイムアウト・並列制御あり）
  const fetchDeliveryPatternsByCustomers = async (customerIds: number[]) => {
    try {
      const patterns: any[] = [];
      const batchSize = 10;
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize);
        const requests = batch.map((cid) => (
          axios.get(`/api/delivery-patterns/customer/${cid}`)
            .then((res) => Array.isArray(res.data) ? res.data.map((r: any) => ({ ...r, customer_id: typeof r.customer_id === 'number' ? r.customer_id : cid })) : [])
            .catch((err) => {
              console.warn(`顧客ID ${cid} の配達パターン取得に失敗しました`, err);
              return [];
            })
        ));
        const results = await Promise.allSettled(requests);
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            patterns.push(...r.value);
          }
        });
      }
      // パターンマップを作成（customerId-productId をキー）
      // 最新の情報で上書きする（商品名などを新パターンに合わせるため）
      const map = new Map<string, any>();
      patterns.forEach((p: any) => {
        const key = `${p.customer_id}-${p.product_id}`;
        map.set(key, p);
      });
      setPatternsMap(map);
      return { patterns, map };
    } catch (e) {
      console.warn('配達パターンデータの取得で予期せぬエラー:', e);
      return { patterns: [], map: new Map<string, any>() };
    }
  };

  // 解約マップ作成：end_date の翌日に「解」を表示
  // ただし、翌日に同一顧客・同一商品の新しいアクティブパターンが開始する場合は「解」を表示しない（パターン分割の翌日再開は真の解約ではない）
  const buildCancelMap = (patterns: any[], start?: string, end?: string) => {
    const map = new Map<string, Set<string>>();
    const inRange = (dateStr: string) => {
      if (!start || !end) return true;
      return dateStr >= start && dateStr <= end;
    };
    patterns.forEach((p: any) => {
      const endDate = p?.end_date;
      const productId = p?.product_id;
      const customerId = p?.customer_id;
      // end_date があるものは翌日に「解」を検討
      if (!endDate || !productId || !customerId) return;
      const d = new Date(endDate);
      d.setDate(d.getDate() + 1);
      const cancelDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      // 翌日に同一商品の新パターン（is_active=1）が開始するなら「解」を抑止
      const nextActiveExists = patterns.some((q: any) => (
        q.customer_id === customerId &&
        q.product_id === productId &&
        Number(q.is_active) === 1 &&
        q.start_date === cancelDate
      ));
      if (nextActiveExists) return;
      if (!inRange(cancelDate)) return;
      const key = `${cancelDate}-${customerId}`;
      const set = map.get(key) || new Set<string>();
      set.add(String(productId));
      map.set(key, set);
    });
    return map;
  };

  const isCancelled = (date: string, customerId: number, productId?: number) => {
    const key = `${date}-${customerId}`;
    const set = cancelMap.get(key);
    if (!set) return false;
    if (productId !== undefined && set.has(String(productId))) return true;
    return false;
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
  const fetchDeliveryData = useCallback(async () => {
    if (!startDate || days <= 0) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = calculateEndDate(startDate, days);
      // 『全コース（コース別）』は期間APIでは『全コース』として扱う
      const courseParam = (selectedCourse === 'all' || selectedCourse === 'all-by-course') ? '' : `&courseId=${selectedCourse}`;
      const response = await fetch(`/api/delivery/period?startDate=${startDate}&endDate=${endDate}${courseParam}`);
      
      if (!response.ok) {
        throw new Error('配達データの取得に失敗しました');
      }

      const data = await response.json();
      const deliveries = data.deliveries || {};
      // 休配反映用に臨時変更を取得（対象顧客のみ）
      const customerIdSet = new Set<number>();
      Object.values(deliveries as Record<string, any>).forEach((courseData: any) => {
        const dayArrays = Object.values(courseData as Record<string, any>) as any[];
        dayArrays.forEach((dayData: any) => {
          const customers = dayData as any[];
          customers.forEach((customer: any) => {
            if (customer && typeof customer.customer_id === 'number') {
              customerIdSet.add(customer.customer_id);
            }
          });
        });
      });
      // 選択コースの顧客も対象に含める（期間中に配達がない顧客の臨時追加を拾うため）
      // 選択コースに属する顧客のIDと custom_id（7桁）を取得
      const fetchCustomerIdsBySelection = async (): Promise<{ ids: number[]; idToCustomId: Map<number, string> }> => {
        try {
          // 『全コース（コース別）』も全顧客対象として扱う（期間中に配達がない顧客の臨時追加を拾うため）
          if (selectedCourse === 'all' || selectedCourse === 'all-by-course') {
            const res = await fetch('/api/customers');
            if (!res.ok) throw new Error('顧客一覧の取得に失敗しました');
            const rows = await res.json();
            if (!Array.isArray(rows)) return { ids: [], idToCustomId: new Map<number, string>() };
            const idToCustomId = new Map<number, string>();
            rows.forEach((r: any) => {
              const idNum = Number(r.id);
              if (Number.isFinite(idNum)) {
                idToCustomId.set(idNum, String(r.custom_id || ''));
              }
            });
            const ids = rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n));
            return { ids, idToCustomId };
          } else {
            const res = await fetch(`/api/customers/by-course/${selectedCourse}`);
            if (!res.ok) throw new Error('コース別顧客一覧の取得に失敗しました');
            const rows = await res.json();
            if (!Array.isArray(rows)) return { ids: [], idToCustomId: new Map<number, string>() };
            const idToCustomId = new Map<number, string>();
            rows.forEach((r: any) => {
              const idNum = Number(r.id);
              if (Number.isFinite(idNum)) {
                idToCustomId.set(idNum, String(r.custom_id || ''));
              }
            });
            const ids = rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n));
            return { ids, idToCustomId };
          }
        } catch (e) {
          console.warn('顧客一覧の取得に失敗しました（臨時変更の対象拡張は一部スキップされます）:', e);
          return { ids: [], idToCustomId: new Map<number, string>() };
        }
      };
      const { ids: extraIds, idToCustomId } = await fetchCustomerIdsBySelection();
      extraIds.forEach(id => customerIdSet.add(id));
      // 期間内に登場する顧客（＋選択コースの全顧客）について、7桁IDマップを完全化する
      const ensureCustomIdsFor = async (customerIds: number[], baseMap: Map<number, string>): Promise<Map<number, string>> => {
        const localMap = new Map<number, string>(Array.from(baseMap.entries()));
        const toFetch: number[] = [];
        customerIds.forEach((cid) => {
          const existing = localMap.get(cid);
          if (!existing || existing.length !== 7) {
            toFetch.push(cid);
          }
        });
        if (toFetch.length === 0) return localMap;
        // 顧客詳細APIで custom_id を取得（詳細画面と同じソースを信頼する）
        const results = await Promise.all(
          toFetch.map(async (cid) => {
            try {
              const res = await fetch(`/api/customers/${cid}`);
              if (!res.ok) return { cid, custom_id: '' };
              const json = await res.json();
              const customId = String(json?.customer?.custom_id || json?.custom_id || '').trim();
              return { cid, custom_id: customId };
            } catch {
              return { cid, custom_id: '' };
            }
          })
        );
        results.forEach(({ cid, custom_id }) => {
          if (custom_id && custom_id.length === 7) {
            localMap.set(cid, custom_id);
          }
        });
        return localMap;
      };
      const idToCustomIdLocal = await ensureCustomIdsFor(Array.from(customerIdSet), idToCustomId);
      // state に反映（UI はこの値を使用して 7桁ID を表示）
      setIdToCustomIdMap(idToCustomIdLocal);
      const changes = await fetchTemporaryChangesInRange(startDate, endDate, Array.from(customerIdSet));
      const newSkipMap = buildSkipMap(changes);
      setSkipMap(newSkipMap);
      // 解約マーカー用に配達パターンを取得
      const { patterns, map: patternsMapLocal } = await fetchDeliveryPatternsByCustomers(Array.from(customerIdSet));
      const newCancelMap = buildCancelMap(patterns, startDate, endDate);
      setCancelMap(newCancelMap);
      // 臨時追加・本数変更の反映
      const addMap = new Map<string, any[]>();
      const modifyMap = new Map<string, any[]>();
      changes.forEach((c: any) => {
        const key = `${c.change_date}-${c.customer_id}`;
        if (c.change_type === 'add') {
          const arr = addMap.get(key) || [];
          arr.push(c);
          addMap.set(key, arr);
        } else if (c.change_type === 'modify') {
          const arr = modifyMap.get(key) || [];
          arr.push(c);
          modifyMap.set(key, arr);
        }
      });

      const findCourseNameForCustomer = (custId: number): string | null => {
        for (const [courseName, courseData] of Object.entries(deliveries as Record<string, any>)) {
          const dayArrays = Object.values(courseData as Record<string, any>) as any[];
          for (const dayData of dayArrays) {
            const customers = dayData as any[];
            for (const customer of customers) {
              if (customer && customer.customer_id === custId) return courseName;
            }
          }
        }
        return null;
      };

      const getCourseNameForCustomerByApi = async (custId: number): Promise<string | null> => {
        try {
          const res = await fetch(`/api/customers/${custId}`);
          if (!res.ok) return null;
          const json = await res.json();
          // /api/customers/:id は { customer: { course_name, ... }, patterns: [...] } の形で返却される
          const courseName = (json && json.customer && typeof json.customer.course_name === 'string')
            ? json.customer.course_name
            : (typeof json?.course_name === 'string' ? json.course_name : null);
          return courseName || null;
        } catch {
          return null;
        }
      };

      const getExistingCustomerSample = (courseName: string, custId: number): any | null => {
        const courseData: any = deliveries[courseName];
        if (!courseData) return null;
        const dayArrays = Object.values(courseData as Record<string, any>) as any[];
        for (const dayData of dayArrays) {
          const customers = dayData as any[];
          for (const customer of customers) {
            if (customer && customer.customer_id === custId) return customer;
          }
        }
        return null;
      };

      const ensureCustomerAtDate = (courseName: string, date: string, custId: number): any => {
        const courseData: any = deliveries[courseName] || (deliveries[courseName] = {});
        const customersArr: any[] = courseData[date] || (courseData[date] = []);
        let customer = customersArr.find((c: any) => c.customer_id === custId);
        if (!customer) {
          const sample = getExistingCustomerSample(courseName, custId);
          customer = {
            customer_id: custId,
            customer_name: sample?.customer_name || `顧客${custId}`,
            address: sample?.address || '',
            phone: sample?.phone || '',
            delivery_order: sample?.delivery_order || null,
            products: []
          };
          customersArr.push(customer);
        }
        return customer;
      };

      const ensureProductOnCustomer = (customer: any, change: any, patternMapOverride?: Map<string, any>) => {
        const pid = Number(change.product_id);
        let product = (customer.products || []).find((p: any) => p.product_id === pid);
        if (!product) {
          const patKey = `${customer.customer_id}-${pid}`;
          const patSource = patternMapOverride || patternsMap;
          const pat = patSource.get(patKey);
          product = {
            product_id: pid,
            product_name: pat?.product_name || change.product_name || `商品${pid}`,
            manufacturer_id: (pat?.manufacturer_id !== undefined && pat?.manufacturer_id !== null) ? Number(pat.manufacturer_id) : ((change.manufacturer_id !== undefined && change.manufacturer_id !== null) ? Number(change.manufacturer_id) : undefined),
            manufacturer_name: pat?.manufacturer_name || change.manufacturer_name || '',
            unit: pat?.unit || change.unit || '',
            quantity: 0,
            unit_price: pat?.unit_price || change.unit_price || 0,
            amount: 0
          };
          customer.products = customer.products || [];
          customer.products.push(product);
        } else {
          // 既存製品にメーカー情報が欠けている場合は補完
          if ((product as any).manufacturer_id === undefined) {
            const patKey = `${customer.customer_id}-${pid}`;
            const patSource = patternMapOverride || patternsMap;
            const pat = patSource.get(patKey);
            if (pat?.manufacturer_id !== undefined && pat?.manufacturer_id !== null) {
              (product as any).manufacturer_id = Number(pat.manufacturer_id);
            } else if (change.manufacturer_id !== undefined && change.manufacturer_id !== null) {
              (product as any).manufacturer_id = Number(change.manufacturer_id);
            }
          }
          if (!product.manufacturer_name) {
            const patKey = `${customer.customer_id}-${pid}`;
            const patSource = patternMapOverride || patternsMap;
            const pat = patSource.get(patKey);
            product.manufacturer_name = pat?.manufacturer_name || change.manufacturer_name || product.manufacturer_name || '';
          }
        }
        return product;
      };

      // modifyを先に適用（既存商品がある前提）。なければ追加として扱う
      const modifyEntries = Array.from(modifyMap.entries());
      for (let i = 0; i < modifyEntries.length; i++) {
        const [key, mods] = modifyEntries[i];
        const sepIdx = key.lastIndexOf('-');
        const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
        const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
        const cid = Number(cidStr);
        let courseName = findCourseNameForCustomer(cid);
        if (!courseName) {
          courseName = await getCourseNameForCustomerByApi(cid);
        }
        if (!courseName) continue;
        const customer = ensureCustomerAtDate(courseName, date, cid);
        mods.forEach((m: any) => {
          const product = ensureProductOnCustomer(customer, m, patternsMapLocal);
          const qty = Number(m.quantity || 0);
          const price = Number(m.unit_price || product.unit_price || 0);
          product.quantity = qty;
          product.unit_price = price;
          product.amount = qty * price;
        });
      }

      // addの適用（存在しない商品を追加）
      const addEntries = Array.from(addMap.entries());
      for (let i = 0; i < addEntries.length; i++) {
        const [key, adds] = addEntries[i];
        const sepIdx = key.lastIndexOf('-');
        const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
        const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
        const cid = Number(cidStr);
        let courseName = findCourseNameForCustomer(cid);
        if (!courseName) {
          courseName = await getCourseNameForCustomerByApi(cid);
        }
        if (!courseName) continue;
        const customer = ensureCustomerAtDate(courseName, date, cid);
        adds.forEach((a: any) => {
          const product = ensureProductOnCustomer(customer, a, patternsMapLocal);
          const qty = Number(a.quantity || 0);
          const price = Number(a.unit_price || product.unit_price || 0);
          product.quantity = qty;
          product.unit_price = price;
          product.amount = qty * price;
        });
      }

      // 変更を反映したデータを保存
      setDeliveryData(deliveries);
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
  }, [startDate, days, selectedCourse, calculateEndDate]);

  // 手動集計ボタンのハンドラー（未使用のため削除）

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
  }, [fetchCourses, fetchDeliveryData, autoFetch]);

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
                    checked={autoFetch}
                    onChange={(e) => setAutoFetch(e.target.checked)}
                    size="small"
                  />
                }
                label="自動集計"
                sx={{ ml: 1 }}
              />
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
                  Object.values(deliveryData as Record<string, any>).forEach((courseData: any) => {
                    Object.values(courseData as Record<string, any>).forEach((dayData: any) => {
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
              Object.values(courseData as Record<string, any>).forEach((dayData: any) => {
                dayData.forEach((customer: any) => {
                  uniqueCustomers.add(customer.customer_id);
                });
              });
              const totalCustomers = uniqueCustomers.size;

              // 全ての日付を取得してソート
              const allDates = Object.keys(courseData).sort();
              
              // 期間内に実際の配達があった顧客×商品を先に抽出（休配は除外）
              const productsWithDelivery = new Set<string>();
              allDates.forEach(date => {
                const customers = courseData[date];
                customers.forEach((customer: any) => {
                  customer.products?.forEach((product: any) => {
                    const skipped = isSkipped(date, customer.customer_id, product.product_id);
                    const qty = product.quantity || 0;
                    if (!skipped && qty > 0) {
                      productsWithDelivery.add(`${customer.customer_id}-${product.product_id}`);
                    }
                  });
                });
              });

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
                        // サーバから渡された custom_id を優先、なければ Map から補完
                        custom_id: (customer.custom_id && String(customer.custom_id).length === 7)
                          ? String(customer.custom_id)
                          : (idToCustomIdMap.get(customer.customer_id) || null),
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

                  // その日が「解」対象なら、存在しない商品行も追加する
                  const cancelKey = `${date}-${customer.customer_id}`;
                  const cancelledSet = cancelMap.get(cancelKey);
                  if (cancelledSet && cancelledSet.size > 0) {
                    cancelledSet.forEach((pidStr: string) => {
                      const pid = Number(pidStr);
                      const cKey = `${customer.customer_id}-${pid}`;
                      // 期間内に実際の配達があった商品に限って「解」行を補完
                      if (!productsWithDelivery.has(cKey)) {
                        return; // 実配達がない商品は補完しない（「解」も表示しない）
                      }
                        if (!customerProductMap.has(cKey)) {
                          const pat = patternsMap.get(cKey);
                          customerProductMap.set(cKey, {
                          customer_id: customer.customer_id,
                          // サーバの値優先 + Map 補完
                          custom_id: (customer.custom_id && String(customer.custom_id).length === 7)
                            ? String(customer.custom_id)
                            : (idToCustomIdMap.get(customer.customer_id) || null),
                          customer_name: customer.customer_name,
                          address: customer.address,
                          phone: customer.phone,
                          delivery_order: customer.delivery_order,
                          product_id: pid,
                          product_name: pat?.product_name || `商品${pid}`,
                          dateQuantities: { [date]: 0 }
                          });
                        } else {
                          const cp = customerProductMap.get(cKey);
                          if (cp && cp.dateQuantities[date] === undefined) {
                            cp.dateQuantities[date] = 0;
                          }
                        }
                    });
                  }
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
                            <TableCell>ID（7桁）</TableCell>
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
                                  {isFirstProductForCustomer ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                      <Link href={`/customers/${customerProduct.customer_id}`} target="_blank" rel="noopener" underline="hover">
                                        {pad7(customerProduct.custom_id)}
                                      </Link>
                                    </Box>
                                  ) : ''}
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
                                  const cancelled = isCancelled(date, customerProduct.customer_id, customerProduct.product_id);
                                  return (
                                    <TableCell key={date} align="center">
                                      {skipped ? (
                                        <Chip label="休" size="small" sx={{ bgcolor: '#ffebee', color: 'red', border: '1px solid #ffcdd2' }} />
                                      ) : cancelled ? (
                                        <Chip label="解" size="small" sx={{ bgcolor: '#fdecea', color: '#d32f2f', border: '1px solid #f8d7da' }} />
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