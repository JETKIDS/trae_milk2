import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import { pad7 } from '../utils/id';

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
  delivery_order?: number;
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
  outOfMonth?: boolean;
}

interface ProductMaster {
  id: number;
  product_name: string;
  sales_tax_type?: 'inclusive' | 'standard' | 'reduced';
  purchase_tax_type?: 'inclusive' | 'standard' | 'reduced';
  sales_tax_rate?: number | null;
}

interface ArSummary {
  prev_year: number;
  prev_month: number;
  prev_invoice_amount: number;
  prev_payment_amount: number;
  carryover_amount: number;
}

// pad7 は共通ユーティリティからインポート

// 単一顧客の請求コンテンツ（96mm高さ）
const InvoiceContent: React.FC<{
  customerId: number;
  year: string;
  month: string;
  company: CompanyInfo | null;
  productMasters: ProductMaster[];
}> = ({ customerId, year, month, company, productMasters }) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([]);
  const [temporaryChanges, setTemporaryChanges] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [roundingEnabled, setRoundingEnabled] = useState<boolean>(true);
  const [billingMethod, setBillingMethod] = useState<'collection' | 'debit'>('collection');

  // 製品名 -> マスタ
  const productMapByName = useMemo(() => {
    const byName: Record<string, ProductMaster> = {};
    productMasters.forEach((m) => { byName[m.product_name] = m; });
    return byName;
  }, [productMasters]);

  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      try {
        const cus = axios.get(`/api/customers/${customerId}`);
        const cal = axios.get(`/api/customers/${customerId}/calendar/${year}/${month}`);
        const [customerRes, calendarRes] = await Promise.all([cus, cal]);
        setCustomer(customerRes.data.customer);
        setPatterns(customerRes.data.patterns || []);
        const settings = customerRes.data.settings;
        setRoundingEnabled(settings ? (settings.rounding_enabled === 1 || settings.rounding_enabled === true) : true);
        setBillingMethod(settings && settings.billing_method === 'debit' ? 'debit' : 'collection');
        setCalendar(calendarRes.data.calendar || []);
        setTemporaryChanges(calendarRes.data.temporaryChanges || []);
      } catch (e: any) {
        console.error('請求書（バッチ）データ取得エラー', e);
        setError('請求データ取得に失敗しました');
      }
    };
    if (customerId && year && month) fetchData();
  }, [customerId, year, month]);

  const [arSummary, setArSummary] = useState<ArSummary | null>(null);
  useEffect(() => {
    const fetchArSummary = async () => {
      try {
        if (!customerId || !year || !month) return;
        const res = await axios.get(`/api/customers/${customerId}/ar-summary`, { params: { year, month } });
        setArSummary(res.data as ArSummary);
      } catch (e) {
        console.error('ARサマリ（バッチ）取得エラー', e);
        setArSummary(null);
      }
    };
    fetchArSummary();
  }, [customerId, year, month]);

  const getTaxRateForProductName = useCallback((name: string): number => {
    const pm = productMapByName[name];
    if (!pm) return 0.1;
    if (typeof pm.sales_tax_rate === 'number' && !isNaN(pm.sales_tax_rate)) {
      return pm.sales_tax_rate > 1 ? pm.sales_tax_rate / 100 : pm.sales_tax_rate;
    }
    const type = pm.sales_tax_type || pm.purchase_tax_type || 'standard';
    if (type === 'reduced') return 0.08;
    return 0.10;
  }, [productMapByName]);

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
    return Math.round(taxSum);
  }, [calendar, productMapByName, getTaxRateForProductName]);

  const monthlyTotalRaw = useMemo(() => {
    return calendar.reduce((sum, day) => sum + day.products.reduce((s, p) => s + p.amount, 0), 0);
  }, [calendar]);

  const monthlyTotal = useMemo(() => {
    let amt = roundingEnabled ? Math.floor(monthlyTotalRaw / 10) * 10 : monthlyTotalRaw;
    if (amt < 0) amt = 0;
    return amt;
  }, [monthlyTotalRaw, roundingEnabled]);

  const previousBalance = useMemo(() => {
    return arSummary?.carryover_amount || 0;
  }, [arSummary]);

  const grandTotal = useMemo(() => {
    return monthlyTotal + (arSummary?.carryover_amount || 0);
  }, [monthlyTotal, arSummary]);

  const generateMonthDays = useCallback((): { firstHalf: MonthDay[]; secondHalf: MonthDay[] } => {
    const mm = String(month).padStart(2, '0');
    const startOfMonth = moment(`${year}-${mm}-01`).startOf('month');
    const endOfMonth = startOfMonth.clone().endOf('month');
    const lastDay = endOfMonth.date();

    const firstHalf: MonthDay[] = [];
    const secondHalf: MonthDay[] = [];

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

    return { firstHalf: firstHalf, secondHalf: secondHalf };
  }, [year, month]);

  const generateProductCalendarData = useCallback(() => {
    const productMap: { [productName: string]: { productName: string; specification: string; dailyQuantities: { [date: string]: number } } } = {};
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
  }, [calendar]);

  const calendarProducts = useMemo(() => {
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
      return { ...d, totalQty: totals.qty, totalAmount: totals.amount };
    });
    withTotals.sort((a, b) => b.totalQty - a.totalQty);
    return withTotals;
  }, [generateProductCalendarData, calendar]);

  const depositRows = useMemo(() => {
    const rows = calendarProducts.filter((p) => p.totalQty > 0).slice(0, 6);
    const pad = { productName: '', specification: '', dailyQuantities: {}, totalQty: 0, totalAmount: 0 } as any;
    while (rows.length < 6) rows.push({ ...pad });
    return rows as any[];
  }, [calendarProducts]);

  const rows = useMemo(() => {
    const pad = { productName: '', specification: '', dailyQuantities: {}, totalQty: 0, totalAmount: 0 } as any;
    const slice = calendarProducts.slice(0, 6);
    while (slice.length < 6) slice.push({ ...pad });
    return slice as any[];
  }, [calendarProducts]);

  const getProductIdByName = (name: string): number | null => {
    const p = patterns.find((pt) => pt.product_name === name);
    return p ? p.product_id : null;
  };

  if (error) {
    return <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>;
  }

  const { firstHalf: firstHalfDays, secondHalf: secondHalfDays } = generateMonthDays();

  return (
    <Box className="invoice-grid">
      {/* 左：入金票／領収証 */}
      <Box className="slips-col" sx={{ height: '100%' }}>
        <Stack className="slips-row" direction="row" spacing={1} sx={{ height: '100%' }}>
          <Box className="box slip-box" sx={{ flex: 1, height: '100%' }}>
            <Typography className="slip-title title">入金票</Typography>
            <Divider sx={{ my: 1 }} />
            <Typography className="small-text shrink-30">コース/順位: {customer?.course_name || ''}{customer?.delivery_order != null ? ` / ${customer.delivery_order}` : ''}</Typography>
            {/* 顧客ID（7桁ゼロ埋めで表示） */}
            <Typography className="small-text shrink-30">顧客ID: {pad7(customer?.custom_id)}</Typography>
            <Typography className="small-text">{customer?.customer_name || ''} 様</Typography>
            <Typography className="small-text shrink-30">住所: {customer?.address || ''}</Typography>
            <Typography className="small-text shrink-30">電話番号: {customer?.phone || ''}</Typography>
            <Typography className="small-text">請求月: {String(year).slice(2)}/{month}月分</Typography>
            <Divider sx={{ my: 1 }} />
            <Box className="deposit-list" sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px', alignItems: 'baseline', mb: 1 }}>
              {depositRows.map((p, idx) => (
                <React.Fragment key={`dep-${idx}-${p.productName || 'blank'}`}>
                  <Typography className="small-text name">{p.productName || '\u00A0'}</Typography>
                  <Typography className="small-text qty" sx={{ textAlign: 'right' }}>{p.totalQty ? `${p.totalQty}本` : ''}</Typography>
                  <Typography className="small-text amount" sx={{ textAlign: 'right' }}>{p.totalAmount ? p.totalAmount.toLocaleString() : ''}</Typography>
                </React.Fragment>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px', alignItems: 'baseline', mb: 1 }}>
              <Typography className="small-text shrink-50">前回残高</Typography>
              <Typography className="small-text shrink-50" sx={{ textAlign: 'right' }}>{previousBalance ? previousBalance.toLocaleString() : ''}</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px', alignItems: 'baseline' }}>
              <Typography className="small-text">請求額</Typography>
              <Typography className="deposit-total" sx={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>￥{grandTotal.toLocaleString()}</Typography>
            </Box>
          </Box>
          <Box className="box slip-box receipt-slip" sx={{ flex: 1, height: '100%' }}>
            <Typography className="slip-title title">領収書</Typography>
            <Divider sx={{ my: 1 }} />
            <Typography className="small-text shrink-30">コース/順位: {customer?.course_name || ''}{customer?.delivery_order != null ? ` / ${customer.delivery_order}` : ''}</Typography>
            {/* 顧客ID（7桁ゼロ埋めで表示） */}
            <Typography className="small-text shrink-30">顧客ID: {pad7(customer?.custom_id)}</Typography>
            <Typography className="small-text">{customer?.customer_name || ''} 様</Typography>
            <Typography className="small-text shrink-30">集金区分: {billingMethod === 'debit' ? '引き落し' : '現金'}</Typography>
            <Typography className="small-text">請求月: {String(year).slice(2)}/{month}月分</Typography>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px', alignItems: 'baseline' }}>
              <Typography className="small-text">領収金額</Typography>
              <Typography className="receipt-total" sx={{ textAlign: 'right', fontWeight: 700 }}>￥{monthlyTotal.toLocaleString()}</Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Typography className="small-text shrink-30" sx={{ textAlign: 'right' }}>　　年　　月　　日</Typography>
            <Typography className="small-text shrink-40" sx={{ mt: 0.5 }}>上記金額、正に領収いたしました。</Typography>
            <Divider sx={{ my: 1 }} />
            <Box className="store-info">
              <Typography className="small-text" sx={{ fontWeight: 700 }}>{company?.company_name || ''}</Typography>
              <Typography className="small-text shrink-30">{company?.address || ''}</Typography>
              <Typography className="small-text shrink-30">{company?.phone ? `TEL ${company.phone}` : ''}</Typography>
            </Box>
          </Box>
        </Stack>
      </Box>

      {/* 右：御請求書 */}
      <Box className="invoice-right">
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0 }}>
          <Typography className="big-title title">御請求書</Typography>
        </Stack>
        <Typography className="billing-month">{String(year).slice(2)}/{month}月分</Typography>
        <Box className="thin-box customer-info" sx={{ p: 0, mb: 0 }}>
          <Typography className="customer-name">{customer?.customer_name} 様</Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography className="address-text">{customer?.address || ''}</Typography>
          </Stack>
        </Box>

        {/* 配達カレンダー */}
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

          {/* 後半（16〜31日） */}
          <TableContainer component={Paper} variant="outlined" className="table-container">
            <Table size="small" className="calendar-table bottom-calendar">
              <colgroup>
                {secondHalfDays.map((_, i) => (
                  <col key={`bottom-col-${i}`} style={{ width: 14 }} />
                ))}
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
                          {d.outOfMonth ? '' : hasSkip ? '休' : (qty || '')}
                        </TableCell>
                      );
                    })}
                    <TableCell className="totals-qty">{product.totalQty ? product.totalQty.toLocaleString() : ''}</TableCell>
                    <TableCell className="totals-amount">{product.totalAmount ? product.totalAmount.toLocaleString() : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* 合計金額欄 */}
        <Box className="thin-box totals-grid" sx={{ p: 0 }}>
          <div className="totals-cell label" style={{ gridColumn: 1, gridRow: 1 }}>前月請求額</div>
          <div className="totals-cell value" style={{ gridColumn: 1, gridRow: 2 }}>{(arSummary?.prev_invoice_amount || 0).toLocaleString()}</div>

          <div className="totals-cell label" style={{ gridColumn: 2, gridRow: 1 }}>前月入金額</div>
          <div className="totals-cell value" style={{ gridColumn: 2, gridRow: 2 }}>{(arSummary?.prev_payment_amount || 0).toLocaleString()}</div>

          <div className="totals-cell label" style={{ gridColumn: 3, gridRow: 1 }}>繰越額</div>
          <div className="totals-cell value" style={{ gridColumn: 3, gridRow: 2 }}>{(arSummary?.carryover_amount || 0).toLocaleString()}</div>

          <div className="totals-cell label" style={{ gridColumn: 4, gridRow: 1 }}>お買上額</div>
          <div className="totals-cell value" style={{ gridColumn: 4, gridRow: 2 }}>{monthlyTotalRaw.toLocaleString()}</div>

          <div className="totals-cell label" style={{ gridColumn: 5, gridRow: 1 }}>消費税額</div>
          <div className="totals-cell value" style={{ gridColumn: 5, gridRow: 2 }}>{`(${includedTaxTotal.toLocaleString()})`}</div>

          <div className="totals-grand-label" style={{ gridColumn: 6, gridRow: '1 / span 2' }}>御請求額</div>
          <div className="totals-grand-amount" style={{ gridColumn: 7, gridRow: '1 / span 2' }}>￥{grandTotal.toLocaleString()}</div>
        </Box>

        {/* フッター */}
        <div className="footer">
          <div>
            <Typography className="small-text">
              {`ID: ${pad7(customer?.custom_id)} / コース: ${customer?.course_name || ''} / ${customer?.delivery_order && customer?.delivery_order > 0 ? customer.delivery_order : '-'}`}
            </Typography>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 8 }}>
            <Typography className="small-text footer-store-name" style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.0 }}>
              {company?.company_name || ''}
            </Typography>
            <Typography className="small-text">
              {[company?.address || '', company?.phone ? `TEL ${company.phone}` : ''].filter(Boolean).join('　')}
            </Typography>
          </div>
        </div>
      </Box>
    </Box>
  );
};

const InvoiceBatchPreview: React.FC = () => {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') || '';
  const year = searchParams.get('year') || String(new Date().getFullYear());
  const month = searchParams.get('month') || String(new Date().getMonth() + 1);
  const auto = searchParams.get('auto') || '';

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productMasters, setProductMasters] = useState<ProductMaster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoPrinted, setAutoPrinted] = useState<boolean>(false);
  const [hasUnconfirmed, setHasUnconfirmed] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStatic = async () => {
      try {
        const [companyRes, productsRes] = await Promise.all([
          axios.get('/api/masters/company'),
          axios.get('/api/products'),
        ]);
        setCompany(companyRes.data);
        const masters: ProductMaster[] = (productsRes.data || []).map((p: any) => ({
          id: p.id,
          product_name: p.product_name,
          sales_tax_type: p.sales_tax_type,
          purchase_tax_type: p.purchase_tax_type,
          sales_tax_rate: typeof p.sales_tax_rate === 'number' ? p.sales_tax_rate : null,
        }));
        setProductMasters(masters);
      } catch (e) {
        console.error('会社・商品マスタ取得エラー', e);
      }
    };
    fetchStatic();
  }, []);

  useEffect(() => {
    const fetchCustomers = async () => {
      setError(null);
      try {
        if (!courseId) {
          setCustomers([]);
          return;
        }
        const res = await axios.get(`/api/customers/by-course/${courseId}`);
        const list: Customer[] = res.data || [];
        setCustomers(list);
      } catch (e) {
        console.error('コース顧客取得エラー', e);
        setError('顧客一覧の取得に失敗しました');
      }
    };
    fetchCustomers();
  }, [courseId]);

  // 月次確定ステータス確認（コース内顧客）
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (!courseId) { setHasUnconfirmed(false); return; }
        const res = await axios.get(`/api/customers/by-course/${courseId}/invoices-amounts`, { params: { year, month } });
        const items: Array<{ confirmed?: boolean }> = res.data?.items || [];
        setHasUnconfirmed(items.some(i => !i.confirmed));
      } catch (e) {
        console.error('請求ステータス取得エラー（バッチ）', e);
        // ステータス取得失敗時は安全側でブロック
        setHasUnconfirmed(true);
      }
    };
    fetchStatus();
  }, [courseId, year, month]);

  const pairs: Array<[Customer | null, Customer | null]> = useMemo(() => {
    const arr: Array<[Customer | null, Customer | null]> = [];
    for (let i = 0; i < customers.length; i += 2) {
      arr.push([customers[i] || null, customers[i + 1] || null]);
    }
    return arr;
  }, [customers]);

  // 自動印刷（必要時）
  useEffect(() => {
    if (!autoPrinted && (auto === '1' || auto === 'true') && customers.length > 0) {
      setAutoPrinted(true);
      // レイアウト・フォントの安定化のためわずかに遅延
      setTimeout(() => {
        try { window.print(); } catch {}
      }, 300);
    }
  }, [auto, customers.length, autoPrinted]);

  const handlePrint = () => {
    // バッチ請求書は横向きに設定してから印刷
    injectPrintOrientation('landscape');
    window.print();
  };

  // ブラウザの印刷（Ctrl+P 等）にも対応：beforeprint/afterprint で向きを適用・解除
  useEffect(() => {
    const onBeforePrint = () => injectPrintOrientation('landscape');
    const onAfterPrint = () => removePrintOrientation();
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    const mql = window.matchMedia('print');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) onBeforePrint(); else onAfterPrint(); };
    try { mql.addEventListener('change', onChange); } catch { /* Safari等 */ mql.addListener(onChange as any); }
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      try { mql.removeEventListener('change', onChange); } catch { mql.removeListener(onChange as any); }
      removePrintOrientation();
    };
  }, []);

  return (
    <Box sx={{ p: 2 }} className="invoice-root print-root">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" className="title no-print">請求書一括印刷プレビュー（2アップ）</Typography>
        <Button variant="contained" className="no-print" onClick={handlePrint} disabled={hasUnconfirmed} title={hasUnconfirmed ? '未確定の顧客が含まれているため印刷できません' : ''}>印刷</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {hasUnconfirmed && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          未確定の顧客が含まれているため、一括プレビューを表示できません。月次管理で当月の「月次確定」を行ってから再度お試しください。
        </Alert>
      )}

      {hasUnconfirmed && (
        <Stack direction="row" spacing={2} className="no-print" sx={{ mb: 2 }}>
          <Button variant="outlined" onClick={() => navigate('/monthly')}>月次管理へ</Button>
          <Button variant="contained" onClick={() => navigate('/billing/invoices')}>請求書発行一覧へ戻る</Button>
        </Stack>
      )}

      {!hasUnconfirmed && pairs.map((pair, pageIdx) => (
        <Card key={pageIdx} sx={{ mb: 2 }} className="print-page">
          <CardContent>
            <div className="two-up">
              {/* 上段 */}
              {pair[0] ? (
                <InvoiceContent customerId={pair[0].id} year={year} month={month} company={company} productMasters={productMasters} />
              ) : (
                <Box className="invoice-grid" />
              )}
              {/* 下段 */}
              {pair[1] ? (
                <InvoiceContent customerId={pair[1].id} year={year} month={month} company={company} productMasters={productMasters} />
              ) : (
                <Box className="invoice-grid" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export default InvoiceBatchPreview;

// 印刷時の向きを動的に切り替えるヘルパー（A4 横／余白込み）
const PRINT_ORIENTATION_STYLE_ID = 'print-page-orientation';
const injectPrintOrientation = (orientation: 'landscape' | 'portrait') => {
  try {
    let el = document.getElementById(PRINT_ORIENTATION_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = PRINT_ORIENTATION_STYLE_ID;
      el.media = 'print';
      document.head.appendChild(el);
    }
    const margin = orientation === 'landscape' ? 'margin: 6mm 7mm 6mm 8mm;' : '';
    el.textContent = `@page { size: A4 ${orientation}; ${margin} }`;
  } catch (e) {
    // noop
  }
};
const removePrintOrientation = () => {
  try {
    const el = document.getElementById(PRINT_ORIENTATION_STYLE_ID);
    if (el) el.remove();
  } catch (e) {
    // noop
  }
};