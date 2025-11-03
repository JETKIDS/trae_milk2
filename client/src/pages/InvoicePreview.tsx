import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
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
import apiClient from '../utils/apiClient';
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
  // コース内順位（配達順）
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

  interface ArSummary {
    prev_year: number;
    prev_month: number;
    prev_invoice_amount: number;
    prev_payment_amount: number;
    current_payment_amount: number;
    carryover_amount: number;
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

  const InvoicePreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [roundingEnabled, setRoundingEnabled] = useState<boolean>(true);
  // 集金区分（現金 or 引き落し）
  const [billingMethod, setBillingMethod] = useState<'collection' | 'debit'>('collection');
  const [error, setError] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([]);
  const [temporaryChanges, setTemporaryChanges] = useState<any[]>([]);
  const [productMapByName, setProductMapByName] = useState<Record<string, ProductMaster>>({});
  const [confirmedStatus, setConfirmedStatus] = useState<{ confirmed: boolean; amount?: number; rounding_enabled?: boolean; confirmed_at?: string } | null>(null);
  const navigate = useNavigate();

  const now = new Date();
  const year = searchParams.get('year') || String(now.getFullYear());
  const month = searchParams.get('month') || String(now.getMonth() + 1);

  // ヘッダーに当月表示は不要のため、月表示は行わない

  useEffect(() => {
    const fetchAll = async () => {
      setError(null);
      try {
        const cop = apiClient.get('/api/masters/company');
        const cus = apiClient.get(`/api/customers/${id}`);
        const cal = apiClient.get(`/api/customers/${id}/calendar/${year}/${month}`);
        const prods = apiClient.get('/api/products');
        const st = apiClient.get(`/api/customers/${id}/invoices/status`, { params: { year, month } });
        const [companyRes, customerRes, calendarRes, productsRes, statusRes] = await Promise.all([cop, cus, cal, prods, st]);
        const status = statusRes.data || { confirmed: false };
        setConfirmedStatus(status);
        if (!status.confirmed) {
          setError('対象月は月次未確定のため、請求書プレビューはできません。月次管理で確定後に再度お試しください。');
          return;
        }
        setCompany(companyRes.data);
        setCustomer(customerRes.data.customer);
        setPatterns(customerRes.data.patterns || []);
        const settings = customerRes.data.settings;
        setRoundingEnabled(settings ? (settings.rounding_enabled === 1 || settings.rounding_enabled === true) : true);
        setBillingMethod(settings && settings.billing_method === 'debit' ? 'debit' : 'collection');
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

  // 商品別合計（現在UIで未使用のため削除）

  

  const monthlyTotalRaw = useMemo(() => {
    return calendar.reduce((sum, day) => sum + day.products.reduce((s, p) => s + p.amount, 0), 0);
  }, [calendar]);

  const monthlyTotal = useMemo(() => {
    let amt = roundingEnabled ? Math.floor(monthlyTotalRaw / 10) * 10 : monthlyTotalRaw;
    if (amt < 0) amt = 0;
    return amt;
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
      const margin = orientation === 'landscape' ? 'margin: 0 !important;' : '';
      el.textContent = `
        @page {
          size: A4 ${orientation};
          margin: 0 !important;
          @top-left { content: none !important; }
          @top-center { content: none !important; }
          @top-right { content: none !important; }
          @bottom-left { content: none !important; }
          @bottom-center { content: none !important; }
          @bottom-right { content: none !important; }
        }
        @media print {
          * { margin-top: 0 !important; }
          body { margin: 0 !important; padding: 0 !important; }
          html { margin: 0 !important; padding: 0 !important; }
          .print-root { 
            margin: 0 !important; 
            padding: 0 !important;
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
          .print-root.MuiBox-root { 
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-root > *:not(.print-page) { 
            display: none !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            line-height: 0 !important;
          }
          .print-page:first-of-type,
          .print-page:first-child { 
            margin-top: 0 !important; 
            padding-top: 0 !important;
            page-break-before: avoid !important;
          }
          /* すべてのprint-pageのマージンを確実に0に */
          .print-page { 
            margin: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding-top: 0 !important;
          }
        }
      `;
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

  const handlePrint = () => {
    // 請求書は横向きに設定してから印刷
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

  // 月次未確定時はブロック表示フラグ（Hook順序維持のため早期returnは行わない）
  const isBlocked = confirmedStatus && !confirmedStatus.confirmed;

  // 1〜月末の全日生成（未使用のため削除）

// Helper: month days split into first/second half
// 前半は1〜15日、後半は「必ず16〜31日」を表示（対象月外の日は空セル）
const generateMonthDays = useCallback((): { firstHalf: MonthDay[]; secondHalf: MonthDay[] } => {
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
}, [year, month]);

  // Helper: map calendar to product-wise daily quantities
  const generateProductCalendarData = useCallback((): ProductCalendarData[] => {
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
  }, [calendar]);

  // Helper: get product id by product name via patterns
  const getProductIdByName = (name: string): number | null => {
    const p = patterns.find((pt) => pt.product_name === name);
    return p ? p.product_id : null;
  };

  // 小計（税抜相当）、内税額（8%/10%を分割）、請求額（端数処理対応）
  // 小計/税額/合計の詳細は現在UIで表示しないため一旦削除（必要になれば復活）

  // 前月請求／前月入金／繰越のサマリ（サーバから取得：暫定実装）
  const [arSummary, setArSummary] = useState<ArSummary | null>(null);
  useEffect(() => {
    const fetchArSummary = async () => {
      try {
        const idNum = Number(id);
        if (!idNum || !year || !month) return;
        const res = await apiClient.get(`/api/customers/${idNum}/ar-summary`, { params: { year, month } });
        setArSummary(res.data as ArSummary);
      } catch (e) {
        console.error('ARサマリ取得エラー', e);
        setArSummary(null);
      }
    };
    fetchArSummary();
  }, [id, year, month]);

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
  }, [generateProductCalendarData, calendar]);

  // 入金票（契約商品）表示行：最大6行、足りない分は空行でパディング
  const depositRows = useMemo<ProductCalendarRow[]>(() => {
    const rows = calendarProducts.filter((p) => p.totalQty > 0).slice(0, 6);
    const pad: ProductCalendarRow = {
      productName: '',
      specification: '',
      dailyQuantities: {},
      totalQty: 0,
      totalAmount: 0,
    };
    while (rows.length < 6) rows.push({ ...pad });
    return rows;
  }, [calendarProducts]);

  // 6行ずつページ分割（不足分は空行でパディングして常に6行表示）
  const calendarPages = useMemo(() => {
    const padRow: ProductCalendarRow = {
      productName: '',
      specification: '',
      dailyQuantities: {},
      totalQty: 0,
      totalAmount: 0,
    };
    const chunks: ProductCalendarRow[][] = [];
    if (calendarProducts.length === 0) {
      // 商品がない場合でも6行の空行ページを1枚表示
      chunks.push(Array.from({ length: 6 }, () => ({ ...padRow })));
      return chunks;
    }
    for (let i = 0; i < calendarProducts.length; i += 6) {
      const slice = calendarProducts.slice(i, i + 6);
      while (slice.length < 6) slice.push({ ...padRow });
      chunks.push(slice);
    }
    return chunks;
  }, [calendarProducts]);

  // 月を前半(1〜15日)と後半(16日〜末日)に分割表示用
  const { firstHalf: firstHalfDays, secondHalf: secondHalfDays } = useMemo(() => generateMonthDays(), [generateMonthDays]);

  // 前回残高（未入金繰越）：ARサマリの carryover_amount を反映
  const previousBalance = useMemo(() => {
    return arSummary?.carryover_amount || 0;
  }, [arSummary]);

  // 御請求額（当月端数処理適用後の請求額 + 前月までの繰越）
  const grandTotal = useMemo(() => {
    return monthlyTotal + (arSummary?.carryover_amount || 0);
  }, [monthlyTotal, arSummary]);

  return (
    <Box sx={{ p: 2 }} className="invoice-root print-root">
      {isBlocked ? (
        <>
          <Alert severity="warning" sx={{ mb: 2 }}>
            対象月は月次未確定のため、請求書プレビューを表示できません。月次管理で確定後に再度お試しください。
          </Alert>
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={() => navigate('/monthly')}>月次管理へ</Button>
            <Button variant="contained" onClick={() => navigate('/billing/invoices')}>請求書発行一覧へ戻る</Button>
          </Stack>
        </>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6" className="title no-print">請求書プレビュー</Typography>
            <Stack direction="row" spacing={1} className="no-print">
              <Button variant="outlined" onClick={() => navigate(`/customers/${id}`)}>戻る</Button>
              <Button variant="contained" onClick={handlePrint}>印刷</Button>
            </Stack>
          </Stack>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {calendarPages.map((rows, pageIdx) => (
            <Card key={pageIdx} sx={{ mb: 2 }} className="print-page">
              <CardContent>
                <div className="two-up">
                  <Box className="invoice-grid">
                  {/* 左：入金票／領収証（左右配置） */}
                  <Box className="slips-col" sx={{ height: '100%' }}>
                    <Stack className="slips-row" direction="row" spacing={1} sx={{ height: '100%' }}>
                      <Box className="box slip-box" sx={{ flex: 1, height: '100%' }}>
                        <Typography className="slip-title title">入金票</Typography>
                        <Divider sx={{ my: 1 }} />
          {/* コース/順位（ブラウザで30%縮小） */}
          <Typography className="small-text shrink-30">コース/順位: {customer?.course_name || ''}{customer?.delivery_order != null ? ` / ${customer.delivery_order}` : ''}</Typography>
          {/* 顧客ID（7桁ゼロ埋めで表示） */}
          <Typography className="small-text shrink-30">顧客ID: {pad7(customer?.custom_id)}</Typography>
                      {/* 顧客名（ラベルを外して氏名のみ表示） */}
                      <Typography className="small-text">{customer?.customer_name || ''} 様</Typography>
          {/* 住所（ブラウザで30%縮小） */}
          <Typography className="small-text shrink-30">住所: {customer?.address || ''}</Typography>
          {/* 電話番号（ブラウザで30%縮小） */}
          <Typography className="small-text shrink-30">電話番号: {customer?.phone || ''}</Typography>
                      {/* 請求月（表示形式を 25/10月分 に統一）*/}
                      <Typography className="small-text">請求月: {String(year).slice(2)}/{month}月分</Typography>
                        <Divider sx={{ my: 1 }} />
                        {/* 契約商品と当月お届け本数とそれぞれの金額 */}
                        <Box className="deposit-list" sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px', alignItems: 'baseline', mb: 1 }}>
                          {depositRows.map((p, idx) => (
                            <React.Fragment key={`dep-${idx}-${p.productName || 'blank'}`}>
                              <Typography className="small-text name">{p.productName || '\u00A0'}</Typography>
                              <Typography className="small-text qty" sx={{ textAlign: 'right' }}>{p.totalQty ? `${p.totalQty}本` : ''}</Typography>
                              <Typography className="small-text amount" sx={{ textAlign: 'right' }}>{p.totalAmount ? p.totalAmount.toLocaleString() : ''}</Typography>
                            </React.Fragment>
                          ))}
                        </Box>
                        {/* 前回残高欄（簡易） */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px', alignItems: 'baseline', mb: 1 }}>
                          <Typography className="small-text shrink-50">前回残高</Typography>
                          <Typography className="small-text shrink-50" sx={{ textAlign: 'right' }}>{previousBalance ? previousBalance.toLocaleString() : ''}</Typography>
                        </Box>
                        {/* 請求額（ラベルの横に金額を表示） */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px', alignItems: 'baseline' }}>
                          <Typography className="small-text">請求額</Typography>
                          <Typography className="deposit-total" sx={{ textAlign: 'right', fontWeight: 700, fontSize: 18 }}>￥{grandTotal.toLocaleString()}</Typography>
                        </Box>
                      </Box>
                      <Box className="box slip-box receipt-slip" sx={{ flex: 1, height: '100%' }}>
                        {/* 領収書タイトル */}
                        <Typography className="slip-title title">領収書</Typography>
                        <Divider sx={{ my: 1 }} />
                        {/* コース/順位（左の入金票と同じく30%縮小） */}
                        <Typography className="small-text shrink-30">コース/順位: {customer?.course_name || ''}{customer?.delivery_order != null ? ` / ${customer.delivery_order}` : ''}</Typography>
                        {/* 顧客ID（7桁ゼロ埋めで表示） */}
                        <Typography className="small-text shrink-30">顧客ID: {pad7(customer?.custom_id)}</Typography>
                      {/* 顧客名（ラベルを外して氏名のみ表示） */}
                      <Typography className="small-text">{customer?.customer_name || ''} 様</Typography>
                        {/* 集金区分（現金 or 引き落し） */}
                        <Typography className="small-text shrink-30">集金区分: {billingMethod === 'debit' ? '引き落し' : '現金'}</Typography>
                      {/* 請求月（表示形式を 25/10月分 に統一）*/}
                      <Typography className="small-text">請求月: {String(year).slice(2)}/{month}月分</Typography>
                        <Divider sx={{ my: 1 }} />
                        {/* 領収金額（ラベルの横に金額を表示） */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px', alignItems: 'baseline' }}>
                          <Typography className="small-text">領収金額</Typography>
                          <Typography className="receipt-total" sx={{ textAlign: 'right', fontWeight: 700 }}>￥{monthlyTotal.toLocaleString()}</Typography>
                        </Box>
                        <Divider sx={{ my: 1 }} />
                        {/* 日付手書きエリア（括弧を削除）右寄せ */}
                        <Typography className="small-text shrink-30" sx={{ textAlign: 'right' }}>　　年　　月　　日</Typography>
                        {/* 領収文言（10%小さく） */}
                        <Typography className="small-text shrink-40" sx={{ mt: 0.5 }}>上記金額、正に領収いたしました。</Typography>
                        <Divider sx={{ my: 1 }} />
                        {/* 店舗情報（下詰め配置） */}
                        <Box className="store-info">
                          <Typography className="small-text" sx={{ fontWeight: 700 }}>{company?.company_name || ''}</Typography>
                          <Typography className="small-text shrink-30">{company?.address || ''}</Typography>
                          <Typography className="small-text shrink-30">{company?.phone ? `TEL ${company.phone}` : ''}</Typography>
                        </Box>
                      </Box>
                    </Stack>
                  </Box>

                  {/* 右：御請求書（商品リストは削除） */}
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

            {/* 配達カレンダー（最大5行） */}
          {/* カレンダー枠の内部余白は元に戻す（外側の隙間はCSSで調整） */}
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
                        {/* 各商品の合計（本数／金額）を別セルで表示。0は空表示にして空行を美しく見せる */}
                        <TableCell className="totals-qty">{product.totalQty ? product.totalQty.toLocaleString() : ''}</TableCell>
                        <TableCell className="totals-amount">{product.totalAmount ? product.totalAmount.toLocaleString() : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

                    {/* 合計金額欄（前月項目＋消費税1枠、右端は「御請求額」ラベルと金額の2セル分割） */}
                    <Box className="thin-box totals-grid" sx={{ p: 0 }}>
                      {/* 左から：前月請求額／前月入金額／繰越額／お買上額／消費税額／右端はラベル＋金額の2セル */}
                      <div className="totals-cell label" style={{ gridColumn: 1, gridRow: 1 }}>前月請求額</div>
                      <div className="totals-cell value" style={{ gridColumn: 1, gridRow: 2 }}>{(arSummary?.prev_invoice_amount || 0).toLocaleString()}</div>

                      <div className="totals-cell label" style={{ gridColumn: 2, gridRow: 1 }}>当月入金額</div>
                      <div className="totals-cell value" style={{ gridColumn: 2, gridRow: 2 }}>{(arSummary?.current_payment_amount || 0).toLocaleString()}</div>

                      <div className="totals-cell label" style={{ gridColumn: 3, gridRow: 1 }}>繰越額</div>
                      <div className="totals-cell value" style={{ gridColumn: 3, gridRow: 2 }}>{(arSummary?.carryover_amount || 0).toLocaleString()}</div>

                      <div className="totals-cell label" style={{ gridColumn: 4, gridRow: 1 }}>お買上額</div>
                      <div className="totals-cell value" style={{ gridColumn: 4, gridRow: 2 }}>{monthlyTotalRaw.toLocaleString()}</div>

                      <div className="totals-cell label" style={{ gridColumn: 5, gridRow: 1 }}>消費税額</div>
                      <div className="totals-cell value" style={{ gridColumn: 5, gridRow: 2 }}>{`(${includedTaxTotal.toLocaleString()})`}</div>

                      {/* 右端：左右2セル（左は反転で「御請求額」、右は金額を強調） */}
                      <div className="totals-grand-label" style={{ gridColumn: 6, gridRow: '1 / span 2' }}>御請求額</div>
        <div className="totals-grand-amount" style={{ gridColumn: 7, gridRow: '1 / span 2' }}>￥{grandTotal.toLocaleString()}</div>
                    </Box>

                    {/* フッター（左：顧客ID/コース/順位、右：店舗名と住所/電話） */}
                    <div className="footer">
                      {/* 左詰め：顧客ID / 配達コース / コース内順位（0/未設定は'-'表示） */}
                      <div>
                        <Typography className="small-text">
                          {`ID: ${pad7(customer?.custom_id)} / コース: ${customer?.course_name || ''} / ${customer?.delivery_order && customer?.delivery_order > 0 ? customer.delivery_order : '-'}`}
                        </Typography>
                      </div>
                      {/* 右詰め：店舗名（大きさ2倍）＋ 住所・電話番号 */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 8 }}>
                        <Typography
                          className="small-text footer-store-name"
                          style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.0 }}
                        >
                          {company?.company_name || ''}
                        </Typography>
                        <Typography className="small-text">
                          {[
                            company?.address || '',
                            company?.phone ? `TEL ${company.phone}` : ''
                          ].filter(Boolean).join('　')}
                        </Typography>
                      </div>
                    </div>
                  </Box>
                </Box>
            </div>
          </CardContent>
        </Card>
      ))}

        </>
      )}

      {/* 旧セクションは新レイアウトに統合済み */}
    </Box>
  );
};

export default InvoicePreview;