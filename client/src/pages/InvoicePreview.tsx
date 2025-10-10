import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  Button,
  Alert,
  TableContainer,
  Paper
} from '@mui/material';
import axios from 'axios';
import moment from 'moment';
import './InvoicePreview.css';

interface CompanyInfo {
  company_name: string;
  postal_code?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  representative?: string;
}

interface Customer {
  id: number;
  custom_id?: string; // 4桁
  customer_name: string;
  address: string;
  phone: string;
  course_id: number;
  course_name: string;
}

interface CalendarProduct {
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  amount: number;
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  dayOfWeek: number; // 0..6
  products: CalendarProduct[];
}

interface DeliveryPattern {
  product_id: number;
  product_name: string;
  is_active: boolean;
  start_date: string;
  end_date?: string | null;
}

interface MonthDay {
  date: string;
  day: number;
  dayOfWeek: number;
  isToday: boolean;
  // 月外（例：28日までの月の29〜31日）を表示するためのフラグ
  outOfMonth?: boolean;
}

interface ProductCalendarData {
  productName: string;
  specification: string;
  dailyQuantities: { [date: string]: number };
}

interface ProductCalendarRow extends ProductCalendarData {
  totalQty: number;
  totalAmount: number;
}

// 商品マスタ（税率関連の値を参照）
interface ProductMaster {
  id: number;
  product_name: string;
  sales_tax_type?: 'inclusive' | 'standard' | 'reduced';
  purchase_tax_type?: 'inclusive' | 'standard' | 'reduced';
  // 数値の税率（%）が登録されていれば使用。未登録の場合は種別から 10%/8% を推定。
  sales_tax_rate?: number | null;
}

// const dowLabels = ['日','月','火','水','木','金','土']; // 未使用

function pad7(customId?: string): string {
  const id = (customId || '').padStart(4, '0');
  return `000${id}`;
}

const InvoicePreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [roundingEnabled, setRoundingEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([]);
  const [temporaryChanges, setTemporaryChanges] = useState<any[]>([]);
  const [productMapByName, setProductMapByName] = useState<Record<string, ProductMaster>>({});

  const now = new Date();
  const year = searchParams.get('year') || String(now.getFullYear());
  const month = searchParams.get('month') || String(now.getMonth() + 1);

  // ヘッダーに当月表示は不要のため、月表示は行わない

  useEffect(() => {
    const fetchAll = async () => {
      setError(null);
      try {
        const cop = axios.get('/api/masters/company');
        const cus = axios.get(`/api/customers/${id}`);
        const cal = axios.get(`/api/customers/${id}/calendar/${year}/${month}`);
        const prods = axios.get('/api/products');
        const [companyRes, customerRes, calendarRes, productsRes] = await Promise.all([cop, cus, cal, prods]);
        setCompany(companyRes.data);
        setCustomer(customerRes.data.customer);
        setPatterns(customerRes.data.patterns || []);
        const settings = customerRes.data.settings;
        setRoundingEnabled(settings ? (settings.rounding_enabled === 1 || settings.rounding_enabled === true) : true);
        setCalendar(calendarRes.data.calendar || []);
        setTemporaryChanges(calendarRes.data.temporaryChanges || []);
        const masters: ProductMaster[] = (productsRes.data || []).map((p: any) => ({
          id: p.id,
          product_name: p.product_name,
          sales_tax_type: p.sales_tax_type,
          purchase_tax_type: p.purchase_tax_type,
          sales_tax_rate: typeof p.sales_tax_rate === 'number' ? p.sales_tax_rate : null,
        }));
        const byName: Record<string, ProductMaster> = {};
        masters.forEach((m) => { byName[m.product_name] = m; });
        setProductMapByName(byName);
      } catch (e: any) {
        console.error('請求書データ取得エラー', e);
        setError('請求書データの取得に失敗しました');
      }
    };
    if (id) fetchAll();
  }, [id, year, month]);

  const productTotals = useMemo(() => {
    const map = new Map<string, { quantity: number; unit: string; unitPrice: number; amount: number }>();
    calendar.forEach(day => {
      day.products.forEach(p => {
        const prev = map.get(p.productName) || { quantity: 0, unit: p.unit, unitPrice: p.unitPrice, amount: 0 };
        const next = {
          quantity: prev.quantity + p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
          amount: prev.amount + p.amount,
        };
        map.set(p.productName, next);
      });
    });
    return Array.from(map.entries()).map(([productName, v]) => ({ productName, ...v }));
  }, [calendar]);

  const monthlyTotalRaw = useMemo(() => {
    return calendar.reduce((sum, day) => sum + day.products.reduce((s, p) => s + p.amount, 0), 0);
  }, [calendar]);

  const monthlyTotal = useMemo(() => {
    if (roundingEnabled) {
      return Math.floor(monthlyTotalRaw / 10) * 10;
    }
    return monthlyTotalRaw;
  }, [monthlyTotalRaw, roundingEnabled]);

  // 税率取得（商品マスタの数値を優先。なければ種別から推定）
  const getTaxRateForProductName = useCallback((name: string): number => {
    const pm = productMapByName[name];
    if (!pm) return 0.1; // 不明時は標準10%
    if (typeof pm.sales_tax_rate === 'number' && !isNaN(pm.sales_tax_rate)) {
      // DBが % で保持している可能性があるため 100 で割る（10 -> 0.10）。
      return pm.sales_tax_rate > 1 ? pm.sales_tax_rate / 100 : pm.sales_tax_rate;
    }
    // 数値がない場合は種別から推定
    const type = pm.sales_tax_type || pm.purchase_tax_type || 'standard';
    if (type === 'reduced') return 0.08;
    return 0.10; // 'standard' もしくはその他
  }, [productMapByName]);

  // 合内消費税（内税）を算出：税込価格の場合は amount * r/(1+r)、税抜価格の場合は amount * r
  const includedTaxTotal = useMemo(() => {
    let taxSum = 0;
    calendar.forEach((day) => {
      day.products.forEach((p) => {
        const rate = getTaxRateForProductName(p.productName);
        const pm = productMapByName[p.productName];
        const taxType = pm?.sales_tax_type || pm?.purchase_tax_type || 'standard';
        if (taxType === 'inclusive') {
          taxSum += p.amount * (rate / (1 + rate));
        } else {
          taxSum += p.amount * rate;
        }
      });
    });
    // 表示は整数円に丸め（一般的な帳票表示に合わせる）
    return Math.round(taxSum);
  }, [calendar, productMapByName, getTaxRateForProductName]);

  const handlePrint = () => {
    window.print();
  };

  // 1〜月末の全日生成
  const generateAllMonthDays = (): MonthDay[] => {
    const startOfMonth = moment(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month');
    const endOfMonth = startOfMonth.clone().endOf('month');
    const days: MonthDay[] = [];
    for (let date = startOfMonth.clone(); date.isSameOrBefore(endOfMonth); date.add(1, 'day')) {
      days.push({
        date: date.format('YYYY-MM-DD'),
        day: date.date(),
        dayOfWeek: date.day(),
        isToday: date.isSame(moment(), 'day'),
      });
    }
    return days;
  };

// Helper: month days split into first/second half
// 前半は1〜15日、後半は「必ず16〜31日」を表示（対象月外の日は空セル）
const generateMonthDays = (): { firstHalf: MonthDay[]; secondHalf: MonthDay[] } => {
  const mm = String(month).padStart(2, '0');
  const startOfMonth = moment(`${year}-${mm}-01`).startOf('month');
  const endOfMonth = startOfMonth.clone().endOf('month');
  const lastDay = endOfMonth.date();

  const firstHalf: MonthDay[] = [];
  const secondHalf: MonthDay[] = [];

  // 前半: 1〜15日（必ず当月内）
  for (let d = 1; d <= Math.min(15, lastDay); d++) {
    const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    const m = moment(dateStr);
    firstHalf.push({
      date: dateStr,
      day: d,
      dayOfWeek: m.day(),
      isToday: m.isSame(moment(), 'day'),
      outOfMonth: false,
    });
  }

  // 後半: 16〜31日（当月外は dayOfWeek を -1 とし、空セルとして扱う）
  for (let d = 16; d <= 31; d++) {
    const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    const isValid = d <= lastDay;
    const m = isValid ? moment(dateStr) : null;
    secondHalf.push({
      date: dateStr,
      day: d,
      dayOfWeek: isValid && m ? m.day() : -1,
      isToday: isValid && m ? m.isSame(moment(), 'day') : false,
      outOfMonth: !isValid,
    });
  }

  return { firstHalf, secondHalf };
};

  // Helper: map calendar to product-wise daily quantities
  const generateProductCalendarData = (): ProductCalendarData[] => {
    const productMap: { [productName: string]: ProductCalendarData } = {};
    calendar.forEach((day) => {
      day.products.forEach((product) => {
        if (!productMap[product.productName]) {
          productMap[product.productName] = {
            productName: product.productName,
            specification: product.unit,
            dailyQuantities: {},
          };
        }
        productMap[product.productName].dailyQuantities[day.date] = product.quantity;
      });
    });
    return Object.values(productMap);
  };

  // Helper: get product id by product name via patterns
  const getProductIdByName = (name: string): number | null => {
    const p = patterns.find((pt) => pt.product_name === name);
    return p ? p.product_id : null;
  };

  // 小計（税抜相当）、内税額、請求額
  const totals = useMemo(() => {
    let base = 0;
    let tax = 0;
    calendar.forEach((day) => {
      day.products.forEach((p) => {
        const rate = getTaxRateForProductName(p.productName);
        const pm = productMapByName[p.productName];
        const taxType = pm?.sales_tax_type || pm?.purchase_tax_type || 'standard';
        if (taxType === 'inclusive') {
          const basePart = p.amount / (1 + rate);
          const taxPart = p.amount - basePart;
          base += basePart;
          tax += taxPart;
        } else {
          base += p.amount;
          tax += p.amount * rate;
        }
      });
    });
    return { base: Math.round(base), tax: Math.round(tax), total: Math.round(base + tax) };
  }, [calendar, getTaxRateForProductName, productMapByName]);

  // カレンダー用の商品行（全件）
  const calendarProducts = useMemo<ProductCalendarRow[]>(() => {
    const data = generateProductCalendarData();
    const withTotals = data.map((d) => {
      const totals = calendar.reduce(
        (acc, day) => {
          const q = d.dailyQuantities[day.date] || 0;
          acc.qty += q;
          const prod = day.products.find((p) => p.productName === d.productName);
          if (prod) acc.amount += prod.amount;
          return acc;
        },
        { qty: 0, amount: 0 }
      );
      return {
        ...d,
        totalQty: totals.qty,
        totalAmount: totals.amount,
      };
    });
    withTotals.sort((a, b) => b.totalQty - a.totalQty);
    return withTotals as ProductCalendarRow[];
  }, [calendar]);

  // 5行ずつページ分割
  const calendarPages = useMemo(() => {
    const chunks: ProductCalendarRow[][] = [];
    for (let i = 0; i < calendarProducts.length; i += 5) {
      chunks.push(calendarProducts.slice(i, i + 5));
    }
    return chunks.length ? chunks : [[]];
  }, [calendarProducts]);

  // 月を前半(1〜15日)と後半(16日〜末日)に分割表示用
  const { firstHalf: firstHalfDays, secondHalf: secondHalfDays } = useMemo(() => generateMonthDays(), [year, month, generateMonthDays]);

  return (
    <Box sx={{ p: 2 }} className="invoice-root">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" className="title no-print">請求書プレビュー</Typography>
        <Button variant="contained" className="no-print" onClick={handlePrint}>印刷</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {calendarPages.map((rows, pageIdx) => (
        <Card key={pageIdx} sx={{ mb: 2 }} className="print-page">
          <CardContent>
            <div className="two-up">
              {[0, 1].map((copyIdx) => (
                <Box key={copyIdx} className="invoice-grid">
                  {/* 左：入金票／領収証（左右配置） */}
                  <Box className="slips-col" sx={{ height: '100%' }}>
                    <Stack className="slips-row" direction="row" spacing={1} sx={{ height: '100%' }}>
                      <Box className="box slip-box" sx={{ flex: 1, height: '100%' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography className="slip-title title">入金票</Typography>
                          <Typography className="small-text">{String(year).slice(2)}/{month}月分</Typography>
                        </Stack>
                        <Divider sx={{ my: 1 }} />
                        <Typography className="small-text">{customer?.customer_name} 様</Typography>
                        <Typography className="small-text">住所: {customer?.address || ''}</Typography>
                        <Typography className="small-text">コース: {customer?.course_name || ''}</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Stack direction="row" justifyContent="space-between">
                          <Typography className="small-text">顧客コード: {pad7(customer?.custom_id)}</Typography>
                          <Typography className="small-text">請求額</Typography>
                        </Stack>
                        <Typography sx={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{totals.total.toLocaleString()}</Typography>
                      </Box>
                      <Box className="box slip-box" sx={{ flex: 1, height: '100%' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography className="slip-title title">領収証</Typography>
                          <Typography className="small-text">{String(year).slice(2)}/{month}月分</Typography>
                        </Stack>
                        <Divider sx={{ my: 1 }} />
                        <Typography className="small-text">{customer?.customer_name} 様</Typography>
                        <Typography className="small-text">区分: 現金</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography className="small-text">領収金額</Typography>
                        <Typography sx={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>{totals.total.toLocaleString()}</Typography>
                      </Box>
                    </Stack>
                  </Box>

                  {/* 右：御請求書（商品リストは削除） */}
                  <Box className="invoice-right">
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography className="big-title title">御請求書</Typography>
                      <Typography className="small-text">{String(year).slice(2)}/{month}月分</Typography>
                    </Stack>
                    <Box className="thin-box" sx={{ p: 1, mb: 1 }}>
                      <Typography className="customer-name">{customer?.customer_name} 様</Typography>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography className="address-text">{customer?.address || ''}</Typography>
                        <Typography className="course-text">コース: {customer?.course_name || ''}</Typography>
                      </Stack>
                    </Box>

            {/* 配達カレンダー（最大5行） */}
            <Box className="thin-box calendar-section" sx={{ p: 1, mb: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* 前半（1〜15日） */}
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }} className="table-container">
                <Table size="small" className="calendar-table">
                  <colgroup>
                    <col style={{ width: 120 }} />
                    {firstHalfDays.map((_, i) => (
                      <col key={`top-col-${i}`} style={{ width: 14 }} />
                    ))}
                  </colgroup>
                  <TableHead>
                    <TableRow>
                      <TableCell className="product-header" sx={{ width: 120, fontWeight: 700 }}>商品名</TableCell>
                      {firstHalfDays.map((d) => (
                        <TableCell key={d.date} className="calendar-header" sx={{ width: 14 }}>
                          <div>{d.day}</div>
                          <div>{['日','月','火','水','木','金','土'][d.dayOfWeek]}</div>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((product, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="product-cell" sx={{ fontWeight: 700 }}>{product.productName}</TableCell>
                        {firstHalfDays.map((d) => {
                          const pid = getProductIdByName(product.productName);
                          const hasSkip = (() => {
                            if (!pid || !temporaryChanges) return false;
                            return temporaryChanges.some((tc) => tc.change_type === 'skip' && tc.product_id === pid && tc.change_date === d.date);
                          })();
                          const qty = product.dailyQuantities[d.date];
                          return (
                            <TableCell key={d.date} className="calendar-cell" sx={{ backgroundColor: d.dayOfWeek === 0 ? '#ffe6e6' : d.dayOfWeek === 6 ? '#e6f3ff' : '#fff' }}>
                              {hasSkip ? '休' : (qty || '')}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* 後半（16〜31日を常に表示） */}
              <TableContainer component={Paper} variant="outlined" className="table-container">
                <Table size="small" className="calendar-table bottom-calendar">
                  <colgroup>
                    {secondHalfDays.map((_, i) => (
                      <col key={`bottom-col-${i}`} style={{ width: 14 }} />
                    ))}
                    {/* 合計表示用の2列（本数／金額）：さらに約2%ずつ削減 */}
                    <col style={{ width: 44 }} />
                    <col style={{ width: 74 }} />
                  </colgroup>
                  <TableHead>
                    <TableRow>
                      {secondHalfDays.map((d) => (
                        <TableCell key={d.date} className="calendar-header">
                          <div>{d.day}</div>
                          <div>{d.dayOfWeek >= 0 ? ['日','月','火','水','木','金','土'][d.dayOfWeek] : ''}</div>
                        </TableCell>
                      ))}
                      {/* 合計欄の見出し：本数・金額を横並びの別セルで表示 */}
                      <TableCell className="totals-header" sx={{ width: 44 }}>本数</TableCell>
                      <TableCell className="totals-header" sx={{ width: 74 }}>金額</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((product, idx) => (
                      <TableRow key={idx}>
                        {secondHalfDays.map((d) => {
                          const pid = getProductIdByName(product.productName);
                          const hasSkip = (() => {
                            if (!pid || !temporaryChanges) return false;
                            return temporaryChanges.some((tc) => tc.change_type === 'skip' && tc.product_id === pid && tc.change_date === d.date);
                          })();
                          const qty = product.dailyQuantities[d.date];
                          return (
                            <TableCell key={d.date} className="calendar-cell" sx={{ backgroundColor: d.dayOfWeek === 0 ? '#ffe6e6' : d.dayOfWeek === 6 ? '#e6f3ff' : '#fff' }}>
                              {/* 月外日は常に空表示 */}
                              {d.outOfMonth ? '' : hasSkip ? '休' : (qty || '')}
                            </TableCell>
                          );
                        })}
                        {/* 各商品の合計（本数／金額）を別セルで表示 */}
                        <TableCell className="totals-qty">{product.totalQty?.toLocaleString?.() ?? 0}</TableCell>
                        <TableCell className="totals-amount">{(product as any).totalAmount?.toLocaleString?.() ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

                    {/* 合計金額欄 */}
                    <Box className="thin-box" sx={{ p: 1 }}>
                      <div className="totals-row">
                        <div className="totals-item"><span className="label">お買上額</span><span className="value">{totals.base.toLocaleString()}</span></div>
                        <div className="totals-item"><span className="label">消費税額</span><span className="value">{totals.tax.toLocaleString()}</span></div>
                        <div className="totals-item"><span className="label">御請求額</span><span className="value">{totals.total.toLocaleString()}</span></div>
                      </div>
                    </Box>

                    {/* フッター */}
                    <div className="footer">
                      <div className="remarks thin-box" style={{ padding: 6 }}>備考欄</div>
                      <div>
                        <Typography className="small-text" sx={{ textAlign: 'right' }}>{company?.company_name || ''}</Typography>
                        <Typography className="small-text" sx={{ textAlign: 'right' }}>{company?.address || ''}</Typography>
                        <Typography className="small-text" sx={{ textAlign: 'right' }}>TEL {company?.phone || ''}</Typography>
                      </div>
                    </div>
                  </Box>
                </Box>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 旧セクションは新レイアウトに統合済み */}
    </Box>
  );
};

export default InvoicePreview;