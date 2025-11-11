import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Button, IconButton, Grid, Card, CardContent, Typography, Chip, Paper, Table, TableHead, TableRow, TableCell, TableBody, TextField, Dialog, Popover, FormControl, InputLabel, Select, MenuItem, TableContainer, Alert } from '@mui/material';
import { Undo as UndoIcon, Edit as EditIcon, ArrowBack as ArrowBackIcon, ArrowForward as ArrowForwardIcon } from '@mui/icons-material';
import apiClient from '../utils/apiClient';
import { createTemporaryChange, deleteTemporaryChange, listCustomerTemporaryChangesForPeriod } from '../services/temporaryChanges';
import moment from 'moment';
import { useParams, useNavigate } from 'react-router-dom';
import { useProductMasters } from '../hooks/useProductMasters';
import CustomerForm from '../components/CustomerForm';
import CustomerActionsSidebar from '../components/CustomerActionsSidebar';
import DeliveryPatternManager from '../components/DeliveryPatternManager';
import TemporaryChangeManager from '../components/TemporaryChangeManager';
// 追記: 入金履歴ダイアログと型
  import PaymentHistoryDialog from '../components/PaymentHistoryDialog';
  import PaymentCollectionDialog from '../components/PaymentCollectionDialog';
  import UnitPriceChangeDialog from '../components/UnitPriceChangeDialog';
  import TemporaryQuantityChangeDialog from '../components/TemporaryQuantityChangeDialog';
  import SuspendProductDialog from '../components/SuspendProductDialog';
  import CancelProductDialog from '../components/CancelProductDialog';
  import BillingRoundingDialog from '../components/BillingRoundingDialog';
import { ArInvoiceStatus } from '../types/ledger';
import BankAccountDialog from '../components/BankAccountDialog';
import { CustomerHistoryPanel } from './customer/CustomerHistoryPanel';
import CustomerCalendarPanel from './customer/CustomerCalendarPanel';
import CustomerDetailPanel from './customer/CustomerDetailPanel';

// 型定義補完（このファイルで参照されるが、別ページにのみ存在していたためローカルに定義）
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
  isToday?: boolean;
  products: CalendarProduct[];
}

interface DeliveryPattern {
  id?: number;
  customer_id: number;
  product_id: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  delivery_days: number[] | string;
  daily_quantities?: { [dayOfWeek: number]: number } | string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

interface MonthDay {
  date: string;
  day: number;
  dayOfWeek: number;
  isToday: boolean;
}

interface ProductMaster {
  product_name: string;
  sales_tax_type?: 'inclusive' | 'standard' | 'reduced' | string | null;
  purchase_tax_type?: 'inclusive' | 'standard' | 'reduced' | string | null;
  sales_tax_rate?: number | null;
}

interface ProductCalendarData {
  productName: string;
  specification: string;
  dailyQuantities: { [date: string]: number };
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

const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // 商品マスタの名前→マスタ情報のMap（フックに統一）
  const { productMapByName } = useProductMasters();

  // 税率取得（商品マスタの数値を優先。なければ種別から推定）
  const getTaxRateForProductName = useCallback((name: string): number => {
    const pm = productMapByName[name];
    if (!pm) return 0.10; // 不明時は標準10%
    if (typeof pm.sales_tax_rate === 'number' && !isNaN(pm.sales_tax_rate)) {
      return pm.sales_tax_rate > 1 ? pm.sales_tax_rate / 100 : pm.sales_tax_rate;
    }
    const type = pm.sales_tax_type || pm.purchase_tax_type || 'standard';
    if (type === 'reduced') return 0.08;
    return 0.10;
  }, [productMapByName]);

  // ===== ここから追記：不足していた状態・関数群の定義 =====
  // 読み込み状態
  const [loading, setLoading] = useState<boolean>(true);
  // 顧客情報
  const [customer, setCustomer] = useState<any | null>(null);
  // カレンダー（日毎の配達）
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  // 定期パターン
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([]);
  // 臨時変更一覧
  const [temporaryChanges, setTemporaryChanges] = useState<TemporaryChange[]>([]);
  // 表示中の年月
  const [currentDate, setCurrentDate] = useState(moment());
  // 当月請求の確定状態
  const [invoiceConfirmed, setInvoiceConfirmed] = useState(false);
  // 追記: 確定日時
  const [invoiceConfirmedAt, setInvoiceConfirmedAt] = useState<string | null>(null);
  // 追記: 前月請求の確定状態（入金処理のガード用）
  const [prevInvoiceConfirmed, setPrevInvoiceConfirmed] = useState<boolean | null>(null);
  // カレンダーの曜日表示用（0=日〜6=土）
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  // スタンドアロン表示判定（URLクエリ ?view=standalone）
  const isStandalone = new URLSearchParams(window.location.search).get('view') === 'standalone';

  // 請求設定
  const [billingMethod, setBillingMethod] = useState<'collection' | 'debit'>('collection');
  const [billingRoundingEnabled, setBillingRoundingEnabled] = useState<boolean>(true);
  // 口座情報 state（引き落し設定時に使用）
  const [bankCode, setBankCode] = useState<string>('');
  const [branchCode, setBranchCode] = useState<string>('');
  const [accountType, setAccountType] = useState<number | null>(null);
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolderKatakana, setAccountHolderKatakana] = useState<string>('');

  // 前月請求/入金/繰越サマリー
  const [arSummary, setArSummary] = useState<any | null>(null);
  // 当月入金額（合計）
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState<number>(0);

  // Undoスタック
  const [undoStack, setUndoStack] = useState<Array<{ description: string; revert: () => Promise<void> }>>([]);
  const pushUndo = (u: { description: string; revert: () => Promise<void> }) => setUndoStack(prev => [u, ...prev]);
  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const [head, ...rest] = undoStack;
    setUndoStack(rest);
    try {
      await head.revert();
      await fetchCustomerData();
      await fetchCalendarData();
    } catch (e) {
      console.error('Undo失敗', e);
    }
  };
  // DeliveryPatternManager からのUndo記録（単体 or 配列の両方を受け付ける）
  const recordUndoFromChild = (
    action: { description: string; revert: () => Promise<void> } | { description: string; revert: () => Promise<void> }[]
  ) => {
    const actions = Array.isArray(action) ? action : [action];
    actions.forEach((a) => pushUndo(a));
  };

  // 参照（子ダイアログ制御）
  const dpManagerRef = useRef<any>(null);
  const tempChangeManagerRef = useRef<any>(null);

  // 編集フォーム
  const [openEditForm, setOpenEditForm] = useState<boolean>(false);

  // セル編集ポップオーバー関連
  const [cellMenuAnchor, setCellMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ productName: string; date: string; quantity?: number } | null>(null);

  // 休配/休配解除ダイアログ
  const [openSkipDialog, setOpenSkipDialog] = useState<boolean>(false);
  const [skipStartDate, setSkipStartDate] = useState<string>('');
  const [skipEndDate, setSkipEndDate] = useState<string>('');
  const [openUnskipDialog, setOpenUnskipDialog] = useState<boolean>(false);
  const [unskipStartDate, setUnskipStartDate] = useState<string>('');
  const [unskipEndDate, setUnskipEndDate] = useState<string>('');

  // 入金登録ダイアログ
  const [openPaymentDialog, setOpenPaymentDialog] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [paymentSaving, setPaymentSaving] = useState<boolean>(false);
  // 追記: 入金履歴ダイアログ開閉
  const [openPaymentHistory, setOpenPaymentHistory] = useState<boolean>(false);
  // 履歴再読込トリガー（Hooks順序を安定化するため、上部に配置）
  const [paymentHistoryRefresh, setPaymentHistoryRefresh] = useState<number>(0);

  // 単価変更ダイアログ
  const [openUnitPriceChange, setOpenUnitPriceChange] = useState<boolean>(false);
  const [unitPriceChangeTargetId, setUnitPriceChangeTargetId] = useState<number | ''>('');
  const [unitPriceChangeNewPrice, setUnitPriceChangeNewPrice] = useState<number | ''>('');
  const [unitPriceChangeStartMonth, setUnitPriceChangeStartMonth] = useState<string>(moment().format('YYYY-MM'));
  const [unitPriceChangeSaving, setUnitPriceChangeSaving] = useState<boolean>(false);

  // その他ダイアログ（未実装のプレースホルダー）
  const [openTemporaryQuantityChange, setOpenTemporaryQuantityChange] = useState<boolean>(false);
  const [openSuspendProduct, setOpenSuspendProduct] = useState<boolean>(false);
  const [openCancelProduct, setOpenCancelProduct] = useState<boolean>(false);
  const [openBillingRounding, setOpenBillingRounding] = useState<boolean>(false);
  const [openBankInfo, setOpenBankInfo] = useState<boolean>(false);

  // 当月の有効な配達曜日ラベル（例: ㊋㊎）を計算
  const getCurrentDeliveryDaysLabel = useCallback((): string => {
    if (!patterns || patterns.length === 0) return '';
    const monthStart = currentDate.clone().startOf('month');
    const monthEnd = currentDate.clone().endOf('month');

    const visible = patterns.filter(p =>
      moment(p.start_date).isSameOrBefore(monthEnd, 'day') &&
      (!p.end_date || moment(p.end_date).isSameOrAfter(monthStart, 'day'))
    );

    const hasDay: boolean[] = Array(7).fill(false); // 0=日,1=月,...6=土

    const toArray = (val: any): number[] => {
      if (Array.isArray(val)) return val as number[];
      if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      }
      return [];
    };
    const toDQ = (val: any): Record<number, number> => {
      if (!val) return {} as Record<number, number>;
      if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return (parsed && typeof parsed === 'object') ? parsed : {}; } catch { return {}; }
      }
      return val as Record<number, number>;
    };

    visible.forEach(p => {
      const dq = toDQ(p.daily_quantities);
      const days = toArray(p.delivery_days);
      // daily_quantities優先（>0 を配達ありと判定）
      let flagged = false;
      for (let d = 0; d < 7; d++) {
        const q = (dq as any)[d];
        if (typeof q === 'number' && q > 0) {
          hasDay[d] = true; flagged = true;
        }
      }
      if (!flagged) {
        days.forEach(d => { if (d >= 0 && d <= 6) hasDay[d] = true; });
      }
    });

    // 表示順は業務慣習に合わせて 月〜土→日（1,2,3,4,5,6,0）
    const order = [1,2,3,4,5,6,0];
    const circled = ['㊐','㊊','㊋','㊌','㊍','㊎','㊏'];
    const label = order.filter(d => hasDay[d]).map(d => circled[d]).join('');
    return label;
  }, [patterns, currentDate]);

  // ===== データ取得関数 =====
  const fetchCustomerData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/customers/${id}`);
      const data = res.data || {};
      if (data.customer) {
        setCustomer(data.customer);
        setPatterns(data.patterns || []);
      } else {
        setCustomer(data);
        setPatterns(data.patterns || []);
      }
      setLoading(false);
    } catch (e) {
      console.error('顧客データ取得エラー', e);
      setLoading(false);
    }
  }, [id]);

  const fetchCalendarData = useCallback(async () => {
    try {
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      const res = await apiClient.get(`/api/customers/${id}/calendar/${y}/${m}`);
      const data = res.data || {};
      setCalendar(data.calendar || []);
      setTemporaryChanges(data.temporaryChanges || []);
    } catch (e) {
      console.error('カレンダー取得エラー', e);
    }
  }, [id, currentDate]);

  const fetchInvoiceStatus = useCallback(async () => {
    try {
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      const res = await apiClient.get(`/api/customers/${id}/invoices/status`, { params: { year: y, month: m } });
      const status: ArInvoiceStatus = res?.data || {} as any;
      setInvoiceConfirmed(Boolean(status?.confirmed));
      setInvoiceConfirmedAt(status?.confirmed_at || null);
    } catch (e) {
      console.error('請求確定状態取得エラー', e);
      setInvoiceConfirmed(false);
      setInvoiceConfirmedAt(null);
    }
  }, [id, currentDate]);

  // 追記: 前月の請求確定状態取得
  const fetchPrevInvoiceStatus = useCallback(async () => {
    try {
      const y = arSummary?.prev_year;
      const m = arSummary?.prev_month;
      if (!y || !m) { setPrevInvoiceConfirmed(null); return; }
      const res = await apiClient.get(`/api/customers/${id}/invoices/status`, { params: { year: y, month: m } });
      const status: ArInvoiceStatus = res?.data || {} as any;
      setPrevInvoiceConfirmed(Boolean(status?.confirmed));
    } catch (e) {
      console.error('前月請求確定状態取得エラー', e);
      setPrevInvoiceConfirmed(null);
    }
  }, [id, arSummary?.prev_year, arSummary?.prev_month]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/customers/${id}`);
      const settings = res.data?.settings || null;
      const bm = settings?.billing_method;
      const re = settings?.rounding_enabled;
      if (bm === 'debit' || bm === 'collection') setBillingMethod(bm);
      setBillingRoundingEnabled(re === undefined || re === null ? true : !!re);
      // 口座情報の読込（存在すれば事前に埋める）
      setBankCode(settings?.bank_code || '');
      setBranchCode(settings?.branch_code || '');
      const at = settings?.account_type;
      setAccountType(typeof at === 'number' ? at : (typeof at === 'string' && at !== '' ? Number(at) : null));
      setAccountNumber(settings?.account_number || '');
      setAccountHolderKatakana(settings?.account_holder_katakana || '');
    } catch (e) {
      console.error('請求設定取得エラー', e);
    }
  }, [id]);

  const fetchArSummary = useCallback(async () => {
    try {
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      const res = await apiClient.get(`/api/customers/${id}/ar-summary`, { params: { year: y, month: m } });
      setArSummary(res.data || null);
    } catch (e) {
      console.error('ARサマリ取得エラー', e);
      setArSummary(null);
    }
  }, [id, currentDate]);

  // 当月入金額を取得（当該月の入金レコード合計）
  const fetchCurrentPaymentAmount = useCallback(async () => {
    try {
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      const res = await apiClient.get(`/api/customers/${id}/payments`, { params: { year: y, month: m, limit: 1000 } });
      const rows = Array.isArray(res.data) ? res.data : [];
      const sum = rows.reduce((acc: number, p: any) => acc + (typeof p.amount === 'number' ? p.amount : 0), 0);
      setCurrentPaymentAmount(sum);
    } catch (e) {
      console.error('当月入金額の取得に失敗しました', e);
      setCurrentPaymentAmount(0);
    }
  }, [id, currentDate]);

  const handlePatternsChange = async () => {
    await fetchCustomerData();
    await fetchCalendarData();
  };

  const handleTemporaryChangesUpdate = async () => {
    await fetchCalendarData();
  };

  // 初期化（顧客情報/設定）
  useEffect(() => {
    fetchCustomerData();
    fetchSettings();
  }, [fetchCustomerData, fetchSettings]);

  // 月変更時にカレンダー/請求状態/ARサマリを再取得
  useEffect(() => {
    fetchCalendarData();
    fetchInvoiceStatus();
    fetchArSummary();
    fetchCurrentPaymentAmount();
  }, [fetchCalendarData, fetchInvoiceStatus, fetchArSummary, fetchCurrentPaymentAmount]);
  // 追加: ARサマリの前月値が揃ったら前月確定状態も取得
  useEffect(() => {
    fetchPrevInvoiceStatus();
  }, [fetchPrevInvoiceStatus]);
  // ===== 追記ここまで =====

  // セルに紐づく商品IDから、指定日の有効な定期パターンを取得
  const findPatternForSelectedCell = (): DeliveryPattern | null => {
    if (!selectedCell) return null;
    const productId = getProductIdByName(selectedCell.productName);
    if (!productId) return null;
    const date = moment(selectedCell.date);
    const pattern = patterns.find(p =>
      p.product_id === productId && p.is_active &&
      date.isSameOrAfter(moment(p.start_date)) &&
      (!p.end_date || date.isSameOrBefore(moment(p.end_date)))
    );
    return pattern || null;
  };

  // 解約（この日以降）：選択日の前日で旧パターンを終了し、以後非表示にする
  const handleCancelFromSelectedDate = async () => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    const pattern = findPatternForSelectedCell();
    if (!pattern || !pattern.id) {
      alert('このセルに対応する定期パターンが見つかりません。');
      return;
    }
    // 確認ダイアログ
    const ok = window.confirm('この日以降の配達を解約します。過去分は残ります。よろしいですか？');
    if (!ok) return;
    // APIペイロードのフォーマット補助（サーバ仕様に合わせる）
    const toDaysString = (val: any): string => {
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'string') return val;
      return '[]';
    };
    const toDQString = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      try { return JSON.stringify(val); } catch { return null; }
    };

    const prevEndDate = pattern.end_date;
    const prevActive = pattern.is_active ? 1 : 0;
    const endDateCandidate = moment(selectedCell.date).subtract(1, 'day').format('YYYY-MM-DD');
    // start_date 以前に終了日が設定される場合は is_active=0 とし、終了日は start_date に合わせる
    const endDateToSend = moment(endDateCandidate).isSameOrAfter(moment(pattern.start_date), 'day')
      ? endDateCandidate
      : moment(pattern.start_date).format('YYYY-MM-DD');
    const isActiveToSend = moment(endDateCandidate).isSameOrAfter(moment(pattern.start_date), 'day') ? 1 : 0;

    try {
      await apiClient.put(`/api/delivery-patterns/${pattern.id}`, {
        product_id: pattern.product_id,
        quantity: pattern.quantity,
        unit_price: pattern.unit_price,
        delivery_days: toDaysString(pattern.delivery_days),
        daily_quantities: toDQString(pattern.daily_quantities),
        start_date: pattern.start_date,
        end_date: endDateToSend,
        // 履歴表示のため、通常は is_active=1 のまま。開始日当日の解約の場合のみ 0。
        is_active: isActiveToSend,
      });
      // Undo 記録：解約の取り消し（end_date を元に戻す、is_active を元の値に復元）
      pushUndo({
        description: '解約を元に戻す',
        revert: async () => {
          if (!pattern.id) return;
          await apiClient.put(`/api/delivery-patterns/${pattern.id}`, {
            product_id: pattern.product_id,
            quantity: pattern.quantity,
            unit_price: pattern.unit_price,
            delivery_days: toDaysString(pattern.delivery_days),
            daily_quantities: toDQString(pattern.daily_quantities),
            start_date: pattern.start_date,
            end_date: prevEndDate || null,
            is_active: prevActive,
          });
        },
      });
      closeCellMenu();
      // パターンとカレンダーの再取得
      await fetchCustomerData();
      await fetchCalendarData();
    } catch (error: any) {
      console.error('解約処理に失敗しました:', error);
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message;
      alert(serverMessage || '解約処理に失敗しました。時間をおいて再度お試しください。');
    }
  };

  // 新ダイアログ用: 指定日の翌日以降を解約（当日は含める）
  const handleCancelFromDate = async (effectiveDate: string) => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    const productId = getProductIdByName(selectedCell.productName);
    if (!productId) return;

    // 指定日の有効なパターンを検索
    const date = moment(effectiveDate);
    const pattern = patterns.find(p =>
      p.product_id === productId && p.is_active &&
      date.isSameOrAfter(moment(p.start_date)) &&
      (!p.end_date || date.isSameOrBefore(moment(p.end_date)))
    );
    if (!pattern || !pattern.id) {
      alert('指定日に有効な定期パターンが見つかりません。');
      return;
    }

    const toDaysString = (val: any): string => {
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'string') return val;
      return '[]';
    };
    const toDQString = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      try { return JSON.stringify(val); } catch { return null; }
    };

    const prevEndDate = pattern.end_date;
    const prevActive = pattern.is_active ? 1 : 0;
    const endDateCandidate = moment(effectiveDate).subtract(1, 'day').format('YYYY-MM-DD');
    const endDateToSend = moment(endDateCandidate).isSameOrAfter(moment(pattern.start_date), 'day')
      ? endDateCandidate
      : moment(pattern.start_date).format('YYYY-MM-DD');
    const isActiveToSend = moment(endDateCandidate).isSameOrAfter(moment(pattern.start_date), 'day') ? 1 : 0;

    try {
      await apiClient.put(`/api/delivery-patterns/${pattern.id}`, {
        product_id: pattern.product_id,
        quantity: pattern.quantity,
        unit_price: pattern.unit_price,
        delivery_days: toDaysString(pattern.delivery_days),
        daily_quantities: toDQString(pattern.daily_quantities),
        start_date: pattern.start_date,
        end_date: endDateToSend,
        is_active: isActiveToSend,
      });
      pushUndo({
        description: '解約を元に戻す',
        revert: async () => {
          if (!pattern.id) return;
          await apiClient.put(`/api/delivery-patterns/${pattern.id}`, {
            product_id: pattern.product_id,
            quantity: pattern.quantity,
            unit_price: pattern.unit_price,
            delivery_days: toDaysString(pattern.delivery_days),
            daily_quantities: toDQString(pattern.daily_quantities),
            start_date: pattern.start_date,
            end_date: prevEndDate || null,
            is_active: prevActive,
          });
        },
      });
      await fetchCustomerData();
      await fetchCalendarData();
      setOpenCancelProduct(false);
    } catch (error: any) {
      console.error('解約処理に失敗しました:', error);
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message;
      alert(serverMessage || '解約処理に失敗しました。時間をおいて再度お試しください。');
    }
  };

  // パターン変更：既存の「配達パターン設定」ダイアログを開く
  const handleOpenPatternChange = () => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      closeCellMenu();
      return;
    }
    const pattern = findPatternForSelectedCell();
    if (!pattern) {
      alert('このセルに対応する定期パターンが見つかりません。');
      return;
    }
    closeCellMenu();
    // 開始日の初期値をクリックしたセルの日付に設定
    const defaultStart = selectedCell ? selectedCell.date : undefined;
    dpManagerRef.current?.openForPattern(pattern, defaultStart);
  };

  // 商品名から product_id を取得（臨時表示の接頭辞を除去して検索）
  const getProductIdByName = useCallback((productName: string): number | null => {
    const normalized = productName.replace(/^（臨時）/, '');
    const found = patterns.find(p => p.product_name === normalized);
    return found ? found.product_id : null;
  }, [patterns]);

  // 選択セルが「解」状態かを判定（前日が終了日、当日に再開がない）
  const selectedCellHasCancel = useCallback((): boolean => {
    if (!selectedCell) return false;
    const pid = getProductIdByName(selectedCell.productName);
    if (!pid) return false;
    const endsPrevDay = patterns.some(p =>
      p.product_id === pid && p.is_active && !!p.end_date &&
      moment(p.end_date).add(1, 'day').format('YYYY-MM-DD') === selectedCell.date
    );
    if (!endsPrevDay) return false;
    const restartsToday = patterns.some(p =>
      p.product_id === pid && p.is_active &&
      moment(p.start_date).format('YYYY-MM-DD') === selectedCell.date
    );
    return endsPrevDay && !restartsToday;
  }, [selectedCell, patterns, getProductIdByName]);

  // 解約取り消し：選択セルが「解」の場合、前日で終了したパターンの end_date を解除（null）
  const handleCancelUndoFromSelectedCell = async () => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    const pid = getProductIdByName(selectedCell.productName);
    if (!pid) return;
    const prevDay = moment(selectedCell.date).subtract(1, 'day').format('YYYY-MM-DD');
    const target = patterns.find(p => p.product_id === pid && p.is_active && p.end_date === prevDay);
    if (!target || !target.id) {
      alert('取り消し対象のパターンが見つかりません。');
      return;
    }
    // APIペイロードのフォーマット補助（サーバ仕様に合わせる）
    const toDaysString = (val: any): string => {
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'string') return val;
      return '[]';
    };
    const toDQString = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      try { return JSON.stringify(val); } catch { return null; }
    };

    try {
      await apiClient.put(`/api/delivery-patterns/${target.id}`, {
        product_id: target.product_id,
        quantity: target.quantity,
        unit_price: target.unit_price,
        delivery_days: toDaysString(target.delivery_days),
        daily_quantities: toDQString(target.daily_quantities),
        start_date: target.start_date,
        end_date: null,
        is_active: 1,
      });
      closeCellMenu();
      await fetchCustomerData();
      await fetchCalendarData();
    } catch (e: any) {
      console.error('解約取り消しに失敗しました:', e);
      const serverMessage = e?.response?.data?.error || e?.response?.data?.message;
      alert(serverMessage || '解約取り消しに失敗しました。時間をおいて再度お試しください。');
    }
  };

  const handleOpenEditForm = () => {
    setOpenEditForm(true);
  };

  const handleCloseEditForm = () => {
    setOpenEditForm(false);
  };

  const handleCustomerUpdated = () => {
    fetchCustomerData(); // 顧客データを再取得
    setOpenEditForm(false);
  };

  const handlePrevMonth = () => {
    setCurrentDate(currentDate.clone().subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentDate(currentDate.clone().add(1, 'month'));
  };

  

  

  // セルクリック時のポップオーバー表示
  const handleCellClick = (
    event: React.MouseEvent<HTMLElement>,
    productName: string,
    date: string,
    quantity?: number
  ) => {
    setSelectedCell({ productName, date, quantity });
    setCellMenuAnchor(event.currentTarget);
    // 期間入力の初期値を選択日に合わせる
    setSkipStartDate(date);
    setSkipEndDate('');
    setUnskipStartDate(date);
    setUnskipEndDate('');
  };

  const closeCellMenu = () => {
    setCellMenuAnchor(null);
  };

  // 本数変更ダイアログを開く
  const openChangeQuantity = () => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      closeCellMenu();
      return;
    }
    if (!selectedCell) return;
    setOpenTemporaryQuantityChange(true);
  };

  // 旧「本数変更」ダイアログのクローズ関数は不要

  // 臨時変更API呼び出し（modify/skip/add）
  const postTemporaryChange = async (
    change_type: 'modify' | 'skip' | 'add',
    payload: { product_id: number | null; quantity?: number; unit_price?: number },
    overrideDate?: string,
    recordUndo: boolean = true
  ): Promise<number | undefined> => {
    if (!selectedCell) return;
    const product_id = payload.product_id ?? getProductIdByName(selectedCell.productName);
    if (!product_id) {
      console.error('商品IDが特定できません:', selectedCell.productName);
      return;
    }
    try {
      const createdId = await createTemporaryChange({
        customer_id: Number(id),
        change_date: overrideDate || selectedCell.date,
        change_type,
        product_id,
        quantity: payload.quantity ?? null,
        unit_price: payload.unit_price ?? null,
        reason: null,
      });
      if (recordUndo && createdId) {
        pushUndo({
          description: '臨時変更の取り消し',
          revert: async () => {
            await deleteTemporaryChange(createdId);
          },
        });
      }
      closeCellMenu();
      fetchCalendarData();
      return createdId;
    } catch (err) {
      console.error('臨時変更の保存に失敗しました:', err);
      return undefined;
    }
  };

  // 本数変更の保存（当日の数量を上書き）
  // 旧「本数変更」ダイアログの保存関数は不要

  // 新ダイアログ用: 一時的な本数変更の保存（当日の数量を上書き）
  const saveChangeQuantityValue = async (quantity: number) => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    await postTemporaryChange('modify', { product_id: null, quantity });
    setOpenTemporaryQuantityChange(false);
  };

  // 休配（当日0本に上書き）
  // 未使用のため削除（期間休配 applySkipForPeriod を使用）

  // 日付範囲の配列を生成（開始日含む、終了日含む）
  const enumerateDates = (start: string, end: string): string[] => {
    const s = moment(start);
    const e = moment(end);
    const dates: string[] = [];
    for (let d = s.clone(); d.isSameOrBefore(e); d.add(1, 'day')) {
      dates.push(d.format('YYYY-MM-DD'));
    }
    return dates;
  };

  // 指定商品の配達予定日かどうか（定期パターンで判定）
  const isScheduledDeliveryDay = (productId: number, dateStr: string): boolean => {
    const date = moment(dateStr);
    const dow = date.day();
    const pattern = patterns.find(p =>
      p.product_id === productId && p.is_active &&
      date.isSameOrAfter(moment(p.start_date)) &&
      (!p.end_date || date.isSameOrBefore(moment(p.end_date)))
    );
    if (!pattern) return false;
    const deliveryDaysArr = Array.isArray(pattern.delivery_days)
      ? pattern.delivery_days
      : typeof pattern.delivery_days === 'string'
        ? (() => { try { return JSON.parse(pattern.delivery_days as unknown as string); } catch { return []; } })()
        : [];
    if (!deliveryDaysArr.includes(dow)) return false;
    const dq = typeof pattern.daily_quantities === 'string'
      ? (() => { try { return JSON.parse(pattern.daily_quantities as unknown as string); } catch { return {}; } })()
      : (pattern.daily_quantities || {});
    const baseQty = (dq as any)[dow];
    const qty = (typeof baseQty === 'number' ? baseQty : pattern.quantity) || 0;
    return qty > 0;
  };

  // 休配（期間）：開始日は選択日、終了日が空なら当日のみ、指定されていれば範囲で適用
  const applySkipForPeriod = async () => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    const start = skipStartDate || selectedCell.date;
    const end = skipEndDate || start;
    const productId = getProductIdByName(selectedCell.productName);
    if (!productId) return;

    const dates = enumerateDates(start, end);
    const createdIds: number[] = [];
    for (const ds of dates) {
      if (isScheduledDeliveryDay(productId, ds)) {
        const idCreated = await postTemporaryChange('skip', { product_id: productId, quantity: 0 }, ds, false);
        if (idCreated) createdIds.push(idCreated);
      }
    }
    setSkipStartDate('');
    setSkipEndDate('');
    await fetchCalendarData();
    if (createdIds.length > 0) {
      pushUndo({
        description: '休配（期間）の取り消し',
        revert: async () => {
          for (const tid of createdIds) {
            try {
              await apiClient.delete(`/api/temporary-changes/${tid}`);
            } catch (e) {
              console.error('休配（期間）取り消しの一部削除:', e);
            }
          }
        },
      });
    }
  };

  // 新ダイアログ用: 休配（期間指定）を適用（開始日、終了日を直接受け取る）
  const applySkipForPeriodWithRange = async (startDate: string, endDate?: string) => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    const productId = getProductIdByName(selectedCell.productName);
    if (!productId) return;
    const start = startDate;
    const end = endDate || startDate;
    const dates = enumerateDates(start, end);
    const createdIds: number[] = [];
    for (const ds of dates) {
      if (isScheduledDeliveryDay(productId, ds)) {
        const idCreated = await postTemporaryChange('skip', { product_id: productId, quantity: 0 }, ds, false);
        if (idCreated) createdIds.push(idCreated);
      }
    }
    await fetchCalendarData();
    if (createdIds.length > 0) {
      pushUndo({
        description: '休配（期間指定）の取り消し',
        revert: async () => {
          for (const tid of createdIds) {
            try {
              await deleteTemporaryChange(tid);
            } catch (e) {
              console.error('休配（期間指定）取り消しの一部削除:', e);
            }
          }
        },
      });
    }
  };

  // 休配解除：開始日〜終了日の範囲で、この商品の skip を削除（終了日が空なら当日のみ）
  const cancelSkipForPeriod = async () => {
    if (invoiceConfirmed) {
      alert('この月は確定済みのため編集できません。');
      return;
    }
    if (!selectedCell) return;
    const start = unskipStartDate || selectedCell.date;
    const end = unskipEndDate || start;
    const productId = getProductIdByName(selectedCell.productName);
    if (!productId) return;

    try {
      const rows = await listCustomerTemporaryChangesForPeriod(id!, start, end);
      const targets = rows.filter(tc => tc.change_type === 'skip' && tc.product_id === productId);
      // 削除前に復元用データを保持
      const restorePayloads = targets.map(t => ({
        customer_id: Number(id),
        change_date: t.change_date,
        change_type: t.change_type,
        product_id: t.product_id!,
        quantity: (t.quantity === null || t.quantity === undefined) ? 0 : t.quantity,
        unit_price: t.unit_price ?? null,
        reason: t.reason ?? null,
      }));
      for (const t of targets) {
        if (t.id) {
          await deleteTemporaryChange(t.id);
        }
      }
      setUnskipStartDate('');
      setUnskipEndDate('');
      closeCellMenu();
      await fetchCalendarData();
      if (restorePayloads.length > 0) {
        pushUndo({
          description: '休配解除の取り消し',
          revert: async () => {
            for (const payload of restorePayloads) {
              try {
                await createTemporaryChange(payload as any);
              } catch (e) {
                console.error('休配解除の取り消し（再作成）に失敗:', e);
              }
            }
          },
        });
      }
    } catch (err) {
      console.error('休配解除に失敗しました:', err);
    }
  };

  const calculateDayTotal = (day: CalendarDay): number => {
    return day.products.reduce((total: number, product: any) => total + product.amount, 0);
  };

  const calculateMonthlyTotal = (): number => {
    let total = 0;
    
    // カレンダーデータから通常の配達金額を集計
    total += calendar.reduce((sum: number, day: CalendarDay) => sum + calculateDayTotal(day), 0);
    
    return total;
  };

  const calculateMonthlyQuantity = (): { [key: string]: number } => {
    const quantities: { [key: string]: number } = {};
    
    // カレンダーデータから通常の配達数量を集計
    calendar.forEach((day: CalendarDay) => {
      day.products.forEach((product: any) => {
        if (!quantities[product.productName]) {
          quantities[product.productName] = 0;
        }
        quantities[product.productName] += product.quantity;
      });
    });

    return quantities;
  };

  // 単価変更の保存
  const handleUnitPriceChangeSave = async () => {
    if (unitPriceChangeTargetId === '' || unitPriceChangeNewPrice === '' || !unitPriceChangeStartMonth) return;
    const target = patterns.find(p => p.id === unitPriceChangeTargetId);
    if (!target) return;
    try {
      setUnitPriceChangeSaving(true);
      // 変更開始日は「指定月の1日」と「既存パターンの開始日」の遅い方を採用する
      const requestedStartDate = `${unitPriceChangeStartMonth}-01`;
      const newStartDate = moment.max(moment(requestedStartDate), moment(target.start_date)).format('YYYY-MM-DD');
      const oldEndDate = moment(newStartDate).subtract(1, 'day').format('YYYY-MM-DD');

      // delivery_days と daily_quantities は型に応じて1回だけJSON化
      const deliveryDaysStr = Array.isArray(target.delivery_days)
        ? JSON.stringify(target.delivery_days)
        : typeof target.delivery_days === 'string'
          ? target.delivery_days
          : '[]';

      const dailyQuantitiesStr = target.daily_quantities
        ? (typeof target.daily_quantities === 'string'
            ? target.daily_quantities
            : JSON.stringify(target.daily_quantities))
        : null;

      // 既存パターンの終了日を変更開始前日に更新（履歴として非アクティブ化）
      await apiClient.put(`/api/delivery-patterns/${unitPriceChangeTargetId}`, {
        product_id: target.product_id,
        quantity: target.quantity,
        unit_price: target.unit_price,
        delivery_days: deliveryDaysStr,
        daily_quantities: dailyQuantitiesStr,
        start_date: target.start_date,
        end_date: oldEndDate,
        // is_active は変更せず維持（終了日で期間を区切る）
        is_active: target.is_active ? 1 : 0,
      });

      // 新単価の新パターンを開始月1日で作成（終了日は無期限: null）
      const createRes = await apiClient.post(`/api/delivery-patterns`, {
        customer_id: target.customer_id,
        product_id: target.product_id,
        quantity: target.quantity,
        unit_price: unitPriceChangeNewPrice,
        delivery_days: deliveryDaysStr,
        daily_quantities: dailyQuantitiesStr,
        start_date: newStartDate,
        end_date: null,
        is_active: 1,
      });
      const newPatternId: number | undefined = createRes?.data?.id as number | undefined;
      // Undo を記録：新パターン削除 + 旧パターンの end_date/is_active を復元
      const prevEnd = target.end_date || null;
      const prevActive = target.is_active ? 1 : 0;
      pushUndo({
        description: '単価変更の取り消し',
        revert: async () => {
          try {
            if (newPatternId) {
              await apiClient.delete(`/api/delivery-patterns/${newPatternId}`);
            }
          } catch (e) {
            console.error('新規パターン削除（Undo）に失敗:', e);
          }
          try {
            await apiClient.put(`/api/delivery-patterns/${unitPriceChangeTargetId}`, {
              product_id: target.product_id,
              quantity: target.quantity,
              unit_price: target.unit_price,
              delivery_days: deliveryDaysStr,
              daily_quantities: dailyQuantitiesStr,
              start_date: target.start_date,
              end_date: prevEnd,
              is_active: prevActive,
            });
          } catch (e) {
            console.error('既存パターン復元（Undo）に失敗:', e);
          }
        },
      });

      // 画面を更新
      setOpenUnitPriceChange(false);
      setUnitPriceChangeTargetId('');
      setUnitPriceChangeNewPrice('');
      setUnitPriceChangeStartMonth(moment().format('YYYY-MM'));
      handlePatternsChange();
    } catch (err) {
      console.error('単価変更の保存に失敗しました:', err);
    } finally {
      setUnitPriceChangeSaving(false);
    }
  };

  // 商品別カレンダーデータを生成
  const generateProductCalendarData = (): ProductCalendarData[] => {
    const productMap: { [key: string]: ProductCalendarData } = {};
    const monthStart = currentDate.clone().startOf('month');
    const monthEnd = currentDate.clone().endOf('month');

    // 当月に有効期間が重なる定期パターンの商品を初期化（翌月以降、配達が完全に終了した商品は表示しない）
    const overlappedPatternProductNames = new Set<string>();
    patterns.forEach(pattern => {
      const startsBeforeOrOnMonthEnd = moment(pattern.start_date).isSameOrBefore(monthEnd, 'day');
      const endsOnOrAfterMonthStart = !pattern.end_date || moment(pattern.end_date).isSameOrAfter(monthStart, 'day');
      if (startsBeforeOrOnMonthEnd && endsOnOrAfterMonthStart && pattern.product_name) {
        overlappedPatternProductNames.add(pattern.product_name);
      }
    });

    // カレンダーデータ（当月の実際の配達）から商品を初期化（臨時商品も含める）
    const deliveredProductNames = new Set<string>();
    calendar.forEach(day => {
      day.products.forEach(p => {
        deliveredProductNames.add(p.productName);
      });
    });

    // 表示対象商品は「当月に定期パターンが重なる商品」または「当月に実配達が発生した商品」の和集合
    const visibleProductNames = new Set<string>();
    overlappedPatternProductNames.forEach((n) => visibleProductNames.add(n));
    deliveredProductNames.forEach((n) => visibleProductNames.add(n));

    // 初期化
    visibleProductNames.forEach(name => {
      // unit は当月カレンダーのデータに合わせる（存在しない場合は空）
      const anyUnit = (() => {
        for (let i = 0; i < calendar.length; i++) {
          const day = calendar[i];
          const found = day.products.find(p => p.productName === name);
          if (found) return found.unit || '';
        }
        // カレンダーデータにない場合はパターンから取得
        const pat = patterns.find(p => p.product_name === name);
        return (pat?.unit) || '';
      })();

      productMap[name] = {
        productName: name,
        specification: anyUnit,
        dailyQuantities: {}
      };
    });

    // 当月の配達数量を設定（通常配達と臨時配達の両方）
    calendar.forEach(day => {
      day.products.forEach(product => {
        if (!productMap[product.productName]) {
          productMap[product.productName] = {
            productName: product.productName,
            specification: product.unit || '',
            dailyQuantities: {}
          };
        }
        productMap[product.productName].dailyQuantities[day.date] = product.quantity;
      });
    });

    return Object.values(productMap);
  };

  // 月の日付配列を生成（前半・後半に分割）
  const generateMonthDays = (): { firstHalf: MonthDay[], secondHalf: MonthDay[] } => {
    const startOfMonth = currentDate.clone().startOf('month');
    const endOfMonth = currentDate.clone().endOf('month');
    const firstHalf: MonthDay[] = [];
    const secondHalf: MonthDay[] = [];
    
    for (let date = startOfMonth.clone(); date.isSameOrBefore(endOfMonth); date.add(1, 'day')) {
      const dayData = {
        date: date.format('YYYY-MM-DD'),
        day: date.date(),
        dayOfWeek: date.day(),
        isToday: date.isSame(moment(), 'day')
      };
      
      if (date.date() <= 15) {
        firstHalf.push(dayData);
      } else {
        secondHalf.push(dayData);
      }
    }
    
    return { firstHalf, secondHalf };
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  if (!customer) {
    return <Typography>顧客が見つかりません。</Typography>;
  }

  const monthlyQuantities = calculateMonthlyQuantity();
  const monthlyTotalRaw = calculateMonthlyTotal();
  // 今月概算合計は「当月概算 + 前月繰越（前月請求額 - 当月入金額）」で表示
  // 牛乳屋の業務フロー：前月の集金額に対して翌月（当月）に入金される
  const tmpBaseMonthlyTotal = billingRoundingEnabled
    ? Math.floor(monthlyTotalRaw / 10) * 10 // 1の位切り捨て（当月分のみ）
    : monthlyTotalRaw;
  const baseMonthlyTotal = Math.max(0, tmpBaseMonthlyTotal);
  // 繰越額 = 前月請求額 - 当月入金額（サーバーから取得、またはフォールバックで計算）
  const prevInvoiceAmount = Number(arSummary?.prev_invoice_amount ?? 0);
  const currentMonthPaymentAmount = Number(
    typeof arSummary?.current_payment_amount === 'number'
      ? arSummary.current_payment_amount
      : currentPaymentAmount || 0
  );
  const carryoverDiffRaw = typeof arSummary?.carryover_amount === 'number'
    ? arSummary.carryover_amount
    : prevInvoiceAmount - currentMonthPaymentAmount;
  const carryoverDiff = carryoverDiffRaw;
  const monthlyTotal = Math.max(0, baseMonthlyTotal + carryoverDiff);

  const handleOpenInvoicePreview = () => {
    const y = currentDate.format('YYYY');
    const m = currentDate.format('M');
    navigate(`/invoice-preview/${id}?year=${y}&month=${m}`);
  };

  // 設定保存ヘルパー
  const saveBillingSettings = async (method: 'collection' | 'debit', roundingEnabled: boolean) => {
    try {
      await apiClient.put(`/api/customers/${id}/settings`, {
        billing_method: method,
        rounding_enabled: roundingEnabled ? 1 : 0,
      });
    } catch (err) {
      console.error('請求設定の保存に失敗しました:', err);
    }
  };

  const handleToggleBillingRounding = async (checked: boolean) => {
    setBillingRoundingEnabled(checked);
    await saveBillingSettings(billingMethod, checked);
  };

  const handleChangeBillingMethod = async (method: 'collection' | 'debit') => {
    setBillingMethod(method);
    await saveBillingSettings(method, billingRoundingEnabled);
  };

  // 月次請求確定（当月）
  const handleConfirmInvoice = async () => {
    try {
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      await apiClient.post(`/api/customers/${id}/invoices/confirm`, { year: y, month: m });
      alert('当月の請求を確定しました。');
      await fetchArSummary(); // 前月・繰越に影響が出る可能性があるため再取得
      await fetchInvoiceStatus();
    } catch (e) {
      console.error('請求確定エラー', e);
      alert('請求確定に失敗しました。時間をおいて再度お試しください。');
    }
  };

  // 追記: 月次確定取消（当月）
  const handleUnconfirmInvoice = async () => {
    try {
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      await apiClient.post(`/api/customers/${id}/invoices/unconfirm`, { year: y, month: m });
      alert('当月の請求確定を取り消しました。');
      await fetchArSummary();
      await fetchInvoiceStatus();
    } catch (e) {
      console.error('請求確定取消エラー', e);
      alert('請求確定の取消に失敗しました。時間をおいて再度お試しください。');
    }
  };


  // 入金登録（指定の年月に紐づけて保存。デフォルトは前月）
  const savePrevPayment = async (amount: number, mode: 'auto' | 'manual', year?: number, month?: number) => {
    try {
      // 金額のバリデーション
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        alert('金額が正しくありません（半角数字のみを入力してください）');
        return;
      }

      // 前月（請求確定対象）の年月を取得
      const prevY = arSummary?.prev_year;
      const prevM = arSummary?.prev_month;
      if (!prevY || !prevM) {
        alert('入金対象の基準（前月確定）が取得できていません');
        return;
      }

      // 以前は引き落しのみ確定必須としていたが、集金と同様の扱いに統一（ガードを撤廃）

      // 入金は「当月」に計上する（履歴・当月入金額の表示と整合）
      const currentY = currentDate.year();
      const currentM = currentDate.month() + 1;
      // 以前の当月確定チェック（debitのみ）も撤廃し、方式に関わらず保存可能とする
      await apiClient.post(`/api/customers/${id}/payments`, {
        year: currentY,
        month: currentM,
        amount: amt,
        method: billingMethod,
        note: mode === 'auto' ? '請求額に対する自動入金' : '手動入金',
      });
      alert('入金を登録しました。');
      // 表示の再取得（当月入金額・繰越・履歴）
      await fetchCurrentPaymentAmount();
      await fetchArSummary();
      setPaymentHistoryRefresh(prev => prev + 1);
    } catch (e) {
      console.error('入金登録エラー', e);
      alert('入金の登録に失敗しました。時間をおいて再度お試しください。');
    }
  };

  // 集金の登録
  const openCollectionDialog = () => {
    // 集金は未確定でも登録可能のため、ダイアログを開く
    setPaymentAmount('');
    setPaymentNote('');
    setOpenPaymentDialog(true);
  };

  const closeCollectionDialog = () => {
    if (paymentSaving) return;
    setOpenPaymentDialog(false);
  };

  const saveCollection = async () => {
    if (paymentAmount === '' || Number(paymentAmount) <= 0) {
      alert('金額を入力してください');
      return;
    }
    try {
      setPaymentSaving(true);
      const y = currentDate.year();
      const m = currentDate.month() + 1;

      // 集金（collection）は未確定でも登録可能

      await apiClient.post(`/api/customers/${id}/payments`, {
        year: y,
        month: m,
        amount: Number(paymentAmount),
        method: 'collection',
        note: paymentNote || undefined,
      });
      setPaymentSaving(false);
      setOpenPaymentDialog(false);
      alert('入金（集金）を登録しました。');
      await fetchCurrentPaymentAmount();
      await fetchArSummary();
      setPaymentHistoryRefresh(prev => prev + 1);
    } catch (e) {
      console.error('入金登録エラー', e);
      setPaymentSaving(false);
      alert('入金登録に失敗しました。時間をおいて再度お試しください。');
    }
  };

  return (
    <Grid container spacing={new URLSearchParams(window.location.search).get('view')==='standalone'?1:2} sx={{ bgcolor: invoiceConfirmed ? '#ffcdd2' : 'transparent', transition: 'background-color 0.2s ease' }}>
      {/* 左：メインコンテンツ（少し狭く） */}
      <Grid item xs={12} md={9}>
        <Box>
      <Card sx={{ mb: new URLSearchParams(window.location.search).get('view')==='standalone'?1:3 }}>
        <CardContent sx={{ p: new URLSearchParams(window.location.search).get('view')==='standalone'?1:undefined }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: new URLSearchParams(window.location.search).get('view')==='standalone'?1:2 }}>
            <Typography variant={new URLSearchParams(window.location.search).get('view')==='standalone'?'h6':'h5'} component="h1">
              {customer.customer_name} 様
              {customer.yomi ? (
                <Typography variant="body2" component="span" sx={{ ml: 2, color: 'text.secondary' }}>
                  （{customer.yomi}）
                </Typography>
              ) : null}
            </Typography>
            <Box sx={{ display: 'flex', gap: new URLSearchParams(window.location.search).get('view')==='standalone'?0.5:1 }}>
              <Button startIcon={<UndoIcon />} variant="outlined" onClick={handleUndo} disabled={undoStack.length === 0} size={new URLSearchParams(window.location.search).get('view')==='standalone'?'small':undefined}>
                元に戻す
              </Button>
              <Button startIcon={<EditIcon />} variant="outlined" onClick={handleOpenEditForm} size={new URLSearchParams(window.location.search).get('view')==='standalone'?'small':undefined}>
                編集
              </Button>
            </Box>
          </Box>
          <Grid container spacing={new URLSearchParams(window.location.search).get('view')==='standalone'?1:2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">住所</Typography>
              <Typography variant="body1">{customer.address}</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="textSecondary">電話番号</Typography>
              <Typography variant="body1">{customer.phone}</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="textSecondary">配達コース</Typography>
              <Chip label={customer.course_name} color="primary" size="small" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 月次カレンダー */}
      {(() => {
        const { firstHalf, secondHalf } = generateMonthDays();
        const productCalendarData = generateProductCalendarData();
        return (
          <CustomerCalendarPanel
            isStandalone={isStandalone}
            dayNames={dayNames}
            currentDate={currentDate}
            firstHalfDays={firstHalf}
            secondHalfDays={secondHalf}
            productCalendarData={productCalendarData}
            temporaryChanges={temporaryChanges}
            patterns={patterns}
            getProductIdByName={getProductIdByName}
            handlePrevMonth={handlePrevMonth}
            handleNextMonth={handleNextMonth}
            onCellClick={handleCellClick}
            invoiceConfirmed={invoiceConfirmed}
            invoiceConfirmedAt={invoiceConfirmedAt}
          />
        );
      })()}

      {/* 月次集計／履歴パネル */}
          <CustomerHistoryPanel
            isStandalone={isStandalone}
            monthlyQuantities={monthlyQuantities}
            calendar={calendar}
            productMapByName={productMapByName}
            getTaxRateForProductName={getTaxRateForProductName}
            monthlyTotal={monthlyTotal}
            prevInvoiceAmount={prevInvoiceAmount}
            currentMonthPaymentAmount={currentMonthPaymentAmount}
            carryoverDiff={carryoverDiff}
            currentDate={currentDate}
            onOpenInvoicePreview={handleOpenInvoicePreview}
            onConfirmInvoice={handleConfirmInvoice}
            onOpenCollectionDialog={openCollectionDialog}
            onOpenPaymentHistory={() => setOpenPaymentHistory(true)}
            invoiceConfirmed={invoiceConfirmed}
          />

        {/* 詳細パネル（配達パターン・臨時変更 管理） */}
        <CustomerDetailPanel
          customerId={Number(id)}
          currentDate={currentDate}
          patterns={patterns}
          temporaryChanges={temporaryChanges}
          dpManagerRef={dpManagerRef}
          tempChangeManagerRef={tempChangeManagerRef}
          onPatternsChange={handlePatternsChange}
          onTemporaryChangesUpdate={handleTemporaryChangesUpdate}
          onRecordUndo={recordUndoFromChild}
          readOnly={invoiceConfirmed}
        />

        {/* 顧客編集フォーム */}
        {customer && (
          <CustomerForm
            open={openEditForm}
            onClose={handleCloseEditForm}
            onSave={handleCustomerUpdated}
            isEdit={true}
            customer={customer}
            onOpenBankInfo={() => { fetchSettings().then(() => setOpenBankInfo(true)).catch(() => setOpenBankInfo(true)); }}
          />
        )}
      </Box>
      </Grid>

      {/* 右：操作メニュー（少し広く） */}
      <Grid item xs={12} md={3}>
        <CustomerActionsSidebar
          customerName={customer.customer_name}
          deliveryDaysLabel={getCurrentDeliveryDaysLabel()}
          customId={customer.custom_id}
          courseName={customer.course_name}
          monthlyTotal={monthlyTotal}
          invoiceConfirmed={invoiceConfirmed}
          invoiceConfirmedAt={invoiceConfirmedAt || undefined}
          onConfirmInvoice={handleConfirmInvoice}
          onUnconfirmInvoice={handleUnconfirmInvoice}
          currentYear={currentDate.year()}
          currentMonth={currentDate.month() + 1}
          prevInvoiceAmount={arSummary?.prev_invoice_amount}
          prevPaymentAmount={arSummary?.prev_payment_amount}
          currentPaymentAmount={currentPaymentAmount}
          prevYear={arSummary?.prev_year}
          prevMonth={arSummary?.prev_month}
          prevMonthConfirmed={prevInvoiceConfirmed ?? undefined}
          onSavePrevPayment={savePrevPayment}
          billingRoundingEnabled={billingRoundingEnabled}
          onToggleBillingRounding={handleToggleBillingRounding}
          billingMethod={billingMethod}
          onChangeBillingMethod={handleChangeBillingMethod}
          onOpenEditForm={handleOpenEditForm}
          onOpenUnitPriceChange={() => setOpenUnitPriceChange(true)}
          onOpenBankInfo={() => { fetchSettings().then(() => setOpenBankInfo(true)).catch(() => setOpenBankInfo(true)); }}
          onOpenPaymentHistory={() => setOpenPaymentHistory(true)}
          // 表示用口座情報
          bankCode={bankCode || ''}
          branchCode={branchCode || ''}
          accountType={accountType ?? null}
          accountNumber={accountNumber || ''}
          accountHolderKatakana={accountHolderKatakana || ''}
        />
      </Grid>

      {/* 以下、各種ダイアログのプレースホルダー */}
      {/* 単価変更 */}
      <Grid item xs={12}>
        <UnitPriceChangeDialog
          open={openUnitPriceChange}
          onClose={() => setOpenUnitPriceChange(false)}
          patterns={patterns}
          unitPriceChangeTargetId={unitPriceChangeTargetId}
          onChangeTargetId={(v) => setUnitPriceChangeTargetId(v)}
          unitPriceChangeNewPrice={unitPriceChangeNewPrice}
          onChangeNewPrice={(v) => setUnitPriceChangeNewPrice(v)}
          unitPriceChangeStartMonth={unitPriceChangeStartMonth}
          onChangeStartMonth={(v) => setUnitPriceChangeStartMonth(v)}
          unitPriceChangeSaving={unitPriceChangeSaving}
          onSave={handleUnitPriceChangeSave}
        />
      </Grid>

      {/* 一時的な数量変更 */}
      <Grid item xs={12}>
        <TemporaryQuantityChangeDialog
          open={openTemporaryQuantityChange}
          onClose={() => setOpenTemporaryQuantityChange(false)}
          invoiceConfirmed={invoiceConfirmed}
          productName={selectedCell?.productName}
          date={selectedCell?.date}
          defaultQuantity={selectedCell?.quantity}
          onSave={saveChangeQuantityValue}
        />
      </Grid>

      {/* 商品の休止 */}
      <Grid item xs={12}>
        <SuspendProductDialog
          open={openSuspendProduct}
          onClose={() => setOpenSuspendProduct(false)}
          invoiceConfirmed={invoiceConfirmed}
          productName={selectedCell?.productName}
          defaultStartDate={selectedCell?.date}
          defaultEndDate={''}
          onSave={(start, end) => applySkipForPeriodWithRange(start, end)}
        />
      </Grid>

      {/* 商品の中止 */}
      <Grid item xs={12}>
        <CancelProductDialog
          open={openCancelProduct}
          onClose={() => setOpenCancelProduct(false)}
          invoiceConfirmed={invoiceConfirmed}
          productName={selectedCell?.productName}
          defaultEffectiveDate={selectedCell?.date}
          onConfirm={handleCancelFromDate}
        />
      </Grid>

      {/* 端数処理（1の位切り捨て） */}
      <Grid item xs={12}>
        <BillingRoundingDialog
          open={openBillingRounding}
          onClose={() => setOpenBillingRounding(false)}
        />
      </Grid>

      {/* 入金登録（集金） */}
      <Grid item xs={12}>
        <PaymentCollectionDialog
          open={openPaymentDialog}
          onClose={closeCollectionDialog}
          invoiceConfirmed={invoiceConfirmed}
          paymentAmount={paymentAmount}
          paymentNote={paymentNote}
          paymentSaving={paymentSaving}
          onPaymentAmountChange={(v) => setPaymentAmount(v)}
          onPaymentNoteChange={(v) => setPaymentNote(v)}
          onSave={saveCollection}
        />
      </Grid>

      {/* 入金履歴 */}
      <Grid item xs={12}>
        <PaymentHistoryDialog
          customerId={Number(id)}
          open={openPaymentHistory}
          onClose={() => setOpenPaymentHistory(false)}
          defaultYear={currentDate.year()}
          defaultMonth={currentDate.month() + 1}
          onUpdated={async () => { await fetchArSummary(); await fetchCurrentPaymentAmount(); }}
          refreshSignal={paymentHistoryRefresh}
        />
      </Grid>

      {/* 口座情報（引き落し選択時の詳細設定） */}
      <Grid item xs={12}>
        <BankAccountDialog
          customerId={Number(id)}
          open={openBankInfo}
          onClose={() => setOpenBankInfo(false)}
          initialValues={{
            bank_code: bankCode || '',
            branch_code: branchCode || '',
            account_type: accountType ?? null,
            account_number: accountNumber || '',
            account_holder_katakana: accountHolderKatakana || '',
          }}
          currentBillingMethod={billingMethod}
          currentRoundingEnabled={billingRoundingEnabled}
          onSaved={async () => {
            await fetchSettings();
            setOpenBankInfo(false);
          }}
        />
      </Grid>

      {/* セル編集ポップオーバー */}
      <Popover
        open={Boolean(cellMenuAnchor)}
        anchorEl={cellMenuAnchor}
        onClose={closeCellMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1, minWidth: 220 }}>
          <Typography variant="subtitle2" sx={{ px: 1, py: 0.5 }}>
            {selectedCell ? `${selectedCell.productName} / ${selectedCell.date}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 1 }}>
            {/* 1. パターン変更 */}
            <Button size="small" onClick={handleOpenPatternChange} disabled={invoiceConfirmed}>
              パターン変更
            </Button>
            {/* 2. 本数変更 */}
            <Button size="small" onClick={() => { closeCellMenu(); openChangeQuantity(); }} disabled={invoiceConfirmed}>
              本数変更
            </Button>
            {/* 3. 商品追加 */}
            <Button size="small" onClick={() => { 
              closeCellMenu(); 
              if (selectedCell) {
                // 配達パターン管理ダイアログを開く（開始日/臨時日を当日で初期化）
                dpManagerRef.current?.openForPattern(undefined, selectedCell.date);
              }
            }} disabled={invoiceConfirmed}>
              商品追加
            </Button>
            {/* 4. 休配処理 */}
            <Button size="small" onClick={() => { closeCellMenu(); setOpenSkipDialog(true); }} disabled={invoiceConfirmed}>
              休配処理
            </Button>
            {/* 5. 休配解除 */}
            <Button size="small" color="primary" onClick={() => { closeCellMenu(); setOpenUnskipDialog(true); }} disabled={invoiceConfirmed}>
              休配解除
            </Button>
            {/* 6. 解約関連：セルが『解』のときは取り消し、それ以外は解約処理 */}
            {selectedCellHasCancel() ? (
              <Button size="small" color="error" onClick={handleCancelUndoFromSelectedCell} disabled={invoiceConfirmed}>
                解約取り消し
              </Button>
            ) : (
              <Button size="small" color="error" onClick={handleCancelFromSelectedDate} disabled={invoiceConfirmed}>
                解約処理
              </Button>
            )}
          </Box>
        </Box>
      </Popover>

      {/* 休配処理ダイアログ（期間入力） */}
      <Dialog open={openSkipDialog} onClose={() => setOpenSkipDialog(false)} fullWidth maxWidth="xs">
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>休配処理（期間）</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {selectedCell ? `${selectedCell.productName} / 開始: ${skipStartDate || selectedCell.date}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              label="開始日"
              type="date"
              value={skipStartDate || (selectedCell ? selectedCell.date : '')}
              onChange={(e) => setSkipStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="終了日（空=開始日のみ）"
              type="date"
              value={skipEndDate}
              onChange={(e) => setSkipEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={() => setOpenSkipDialog(false)}>キャンセル</Button>
            <Button variant="contained" onClick={async () => { await applySkipForPeriod(); setOpenSkipDialog(false); }} disabled={invoiceConfirmed}>
              適用
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* 休配解除ダイアログ（期間入力） */}
      <Dialog open={openUnskipDialog} onClose={() => setOpenUnskipDialog(false)} fullWidth maxWidth="xs">
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>休配解除（期間）</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {selectedCell ? `${selectedCell.productName} / 開始: ${unskipStartDate || selectedCell.date}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              label="開始日"
              type="date"
              value={unskipStartDate || (selectedCell ? selectedCell.date : '')}
              onChange={(e) => setUnskipStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="終了日（空=開始日のみ）"
              type="date"
              value={unskipEndDate}
              onChange={(e) => setUnskipEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={() => setOpenUnskipDialog(false)}>キャンセル</Button>
            <Button variant="contained" color="primary" onClick={async () => { await cancelSkipForPeriod(); setOpenUnskipDialog(false); }} disabled={invoiceConfirmed}>
              解除
            </Button>
          </Box>
        </Box>
      </Dialog>

      

    </Grid>
  );
};

export default CustomerDetail;