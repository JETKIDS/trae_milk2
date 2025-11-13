import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, CircularProgress, Container, FormControlLabel, Grid, MenuItem, Paper, Select, TextField, Typography, ToggleButtonGroup, ToggleButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { pad7 } from '../utils/id';
import { getPrevYearMonth } from '../utils/date';

interface Course { id: number; custom_id: string; course_name: string; }
interface Customer { id: number; custom_id: string; customer_name: string; billing_method?: string; rounding_enabled?: number; course_name?: string; course_custom_id?: string; delivery_order?: number }
interface InvoiceItem { customer_id: number; amount: number; confirmed: boolean; rounding_enabled: number }

const now = new Date();

// fetchのタイムアウトユーティリティ（デフォルト30秒）
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? 30_000;
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

export default function BulkCollection({ method = 'collection', readOnly = false }: { method?: 'collection' | 'debit' | 'both'; readOnly?: boolean }) {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { year: invoiceYear, month: invoiceMonth } = useMemo(() => getPrevYearMonth(year, month), [year, month]);
  const [courses, setCourses] = useState<Course[]>([]);
  // コース選択値は数値ID、未選択（空文字）、全コース（'__ALL__'）のいずれか
  type CourseSelectValue = number | '' | '__ALL__';
  const [courseId, setCourseId] = useState<CourseSelectValue>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [amounts, setAmounts] = useState<Record<number, number>>({}); // 手入力（任意）
  const [invoiceAmounts, setInvoiceAmounts] = useState<Record<number, number>>({}); // 指定月請求額（満額）
  const [paidTotals, setPaidTotals] = useState<Record<number, number>>({}); // 指定月入金済み合計（金額）
  const [confirmedMap, setConfirmedMap] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState<string>(method === 'debit' ? '引き落し一括登録' : '集金一括登録');
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [hideFullyPaid, setHideFullyPaid] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'perCourse' | 'allCourses'>(readOnly ? 'allCourses' : 'perCourse');
  const [filterMode, setFilterMode] = useState<'all' | 'collectionOnly' | 'debitOnly'>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);

  // 確認ダイアログ用の状態
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEntries, setConfirmEntries] = useState<Array<{ customer_id: number; name: string; remaining: number; amount: number }>>([]);
  const [confirmTotal, setConfirmTotal] = useState(0);
  const [confirmMode, setConfirmMode] = useState<'auto' | 'manual'>('auto');
  const [confirmAmountMap, setConfirmAmountMap] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const resp = await fetchWithTimeout('/api/masters/courses');
        const rows: Course[] = await resp.json();
        setCourses(rows);
      } catch (e) {
        console.error('コース一覧の取得に失敗（タイムアウト/ネットワーク）:', e);
        setCourses([]);
      }
    };
    loadCourses();
  }, []);

  const fetchInvoicesAmounts = async (cid: number, y: number, m: number, meth: 'collection' | 'debit') => {
    try {
      const resp = await fetchWithTimeout(`/api/customers/by-course/${cid}/invoices-amounts?year=${y}&month=${m}&method=${meth}`);
      const json: { items: InvoiceItem[] } = await resp.json();
      const invMap: Record<number, number> = {};
      const confMap: Record<number, boolean> = {};
      for (const it of (json.items || [])) {
        invMap[it.customer_id] = it.amount;
        confMap[it.customer_id] = !!it.confirmed;
      }
      return { invMap, confMap };
    } catch (e) {
      console.error('請求額取得に失敗（タイムアウト/ネットワーク）:', e);
      return { invMap: {}, confMap: {} };
    }
  };

  const fetchInvoicesAmountsMerged = async (cid: number, y: number, m: number) => {
    const coll = await fetchInvoicesAmounts(cid, y, m, 'collection');
    const deb = await fetchInvoicesAmounts(cid, y, m, 'debit');
    return { invMap: { ...coll.invMap, ...deb.invMap }, confMap: { ...coll.confMap, ...deb.confMap } };
  };

  const fetchPaymentsSumMap = async (cid: number, y: number, m: number) => {
    try {
      const resp = await fetchWithTimeout(`/api/customers/by-course/${cid}/payments-sum?year=${y}&month=${m}`);
      const json: { items: { customer_id: number; total: number }[] } = await resp.json();
      const paidMap: Record<number, number> = {};
      for (const it of (json.items || [])) {
        paidMap[it.customer_id] = it.total || 0;
      }
      return paidMap;
    } catch (e) {
      console.error('入金済み合計取得に失敗（タイムアウト/ネットワーク）:', e);
      return {};
    }
  };

  const loadCustomers = async (cid: number) => {
    try {
      setLoading(true);
      const co = courses.find(c => c.id === cid);
      const addCourseInfo = (list: Customer[]) => list.map(c => ({ ...c, course_name: co?.course_name, course_custom_id: co?.custom_id }));
      let rows: Customer[] = [];
      // 対象（入金）月と前月（請求参照）を分離
      if (readOnly || method === 'both') {
        try {
          const respC = await fetchWithTimeout(`/api/customers/by-course/${cid}/collection`);
          const coll: Customer[] = await respC.json();
          const respD = await fetchWithTimeout(`/api/customers/by-course/${cid}/debit`);
          const deb: Customer[] = await respD.json();
          rows = addCourseInfo(coll.map(c => ({ ...c, billing_method: c.billing_method || 'collection' })))
            .concat(addCourseInfo(deb.map(c => ({ ...c, billing_method: c.billing_method || 'debit' }))));
        } catch (e) {
          console.error('顧客リスト取得に失敗（タイムアウト/ネットワーク）:', e);
          rows = [];
        }
      } else {
        try {
          const resp = await fetchWithTimeout(`/api/customers/by-course/${cid}/${method === 'debit' ? 'debit' : 'collection'}`);
          const list: Customer[] = await resp.json();
          rows = addCourseInfo(list.map(c => ({ ...c, billing_method: c.billing_method || (method === 'debit' ? 'debit' : 'collection') })));
        } catch (e) {
          console.error('顧客リスト取得に失敗（タイムアウト/ネットワーク）:', e);
          rows = [];
        }
      }
      setCustomers(rows);
      setChecked({});
      setAmounts({});
      // 請求額・確定フラグは前月を参照
      const { invMap, confMap } = await fetchInvoicesAmountsMerged(cid, invoiceYear, invoiceMonth);
      setInvoiceAmounts(prev => ({ ...prev, ...invMap }));
      setConfirmedMap(prev => ({ ...prev, ...confMap }));
      // 入金合計は当月（対象月）を参照
      const paidMap = await fetchPaymentsSumMap(cid, year, month);
      setPaidTotals(prev => ({ ...prev, ...paidMap }));
    } catch (e) {
      console.error('顧客・請求関連データ取得に失敗:', e);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const loadAllCoursesData = async () => {
    const invAll: Record<number, number> = {};
    const confAll: Record<number, boolean> = {};
    const paidAll: Record<number, number> = {};
    let allRows: Customer[] = [];
    for (const co of courses) {
      let rows: Customer[] = [];
      if (readOnly || method === 'both') {
        try {
          const respC = await fetchWithTimeout(`/api/customers/by-course/${co.id}/collection`);
          const coll: Customer[] = await respC.json();
          const respD = await fetchWithTimeout(`/api/customers/by-course/${co.id}/debit`);
          const deb: Customer[] = await respD.json();
          rows = coll.map(c => ({ ...c, billing_method: c.billing_method || 'collection', course_name: co.course_name, course_custom_id: co.custom_id }))
            .concat(deb.map(c => ({ ...c, billing_method: c.billing_method || 'debit', course_name: co.course_name, course_custom_id: co.custom_id })));
        } catch (e) {
          console.error('全コース顧客取得に失敗（タイムアウト/ネットワーク）:', e);
          rows = [];
        }
      } else {
        try {
          const resp = await fetchWithTimeout(`/api/customers/by-course/${co.id}/${method === 'debit' ? 'debit' : 'collection'}`);
          const list: Customer[] = await resp.json();
          rows = list.map(c => ({ ...c, billing_method: c.billing_method || (method === 'debit' ? 'debit' : 'collection'), course_name: co.course_name, course_custom_id: co.custom_id }));
        } catch (e) {
          console.error('全コース顧客取得に失敗（タイムアウト/ネットワーク）:', e);
          rows = [];
        }
      }
      allRows = allRows.concat(rows);
      // 前月（請求参照）を使用
      const { invMap, confMap } = await fetchInvoicesAmountsMerged(co.id, invoiceYear, invoiceMonth);
      Object.assign(invAll, invMap);
      Object.assign(confAll, confMap);
      // 当月（対象月）の入金合計
      const paidMap = await fetchPaymentsSumMap(co.id, year, month);
      Object.assign(paidAll, paidMap);
    }
    setCustomers(allRows);
    setChecked({});
    setAmounts({});
    setInvoiceAmounts(invAll);
    setConfirmedMap(confAll);
    setPaidTotals(paidAll);
    setLoaded(true);
  };

  const onChangeCourse = (e: any) => {
    const v = e.target.value;
    if (v === '__ALL__') {
      setViewMode('allCourses');
      setCourseId('__ALL__');
      setLoaded(false);
      return;
    }
    if (v === '' || v === null || v === undefined) {
      setCourseId('');
      setLoaded(false);
      return;
    }
    const next = Number(v);
    if (!Number.isNaN(next)) {
      setCourseId(next);
      setViewMode('perCourse');
      setLoaded(false);
    }
  };

  const toggleCheck = (id: number, value: boolean) => {
    setChecked(prev => ({ ...prev, [id]: value }));
  };

  const setAllChecked = (value: boolean) => {
    const next: Record<number, boolean> = {};
    customers.forEach(c => { next[c.id] = value && !!confirmedMap[c.id] && ((remainingMap[c.id] || 0) > 0); });
    setChecked(next);
  };


  const remainingMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const c of customers) {
      const inv = invoiceAmounts[c.id] || 0;
      const paid = paidTotals[c.id] || 0;
      const rem = Math.max(inv - paid, 0);
      map[c.id] = rem;
    }
    return map;
  }, [customers, invoiceAmounts, paidTotals]);

  const customersSorted = useMemo(() => {
    let arr = customers.filter(c => !hideFullyPaid || (remainingMap[c.id] || 0) > 0);
    if (filterMode === 'collectionOnly') {
      arr = arr.filter(c => (c.billing_method || 'collection') === 'collection');
    } else if (filterMode === 'debitOnly') {
      arr = arr.filter(c => (c.billing_method || 'collection') === 'debit');
    }
    arr.sort((a, b) => {
      if (viewMode === 'perCourse') {
        const oa = typeof a.delivery_order === 'number' ? a.delivery_order : 999999;
        const ob = typeof b.delivery_order === 'number' ? b.delivery_order : 999999;
        if (oa !== ob) return oa - ob;
        const ida = parseInt(String(a.custom_id || '').replace(/\D/g, ''), 10) || 0;
        const idb = parseInt(String(b.custom_id || '').replace(/\D/g, ''), 10) || 0;
        return ida - idb;
      } else {
        const cida = parseInt(String(a.course_custom_id || '').replace(/\D/g, ''), 10) || 0;
        const cidb = parseInt(String(b.course_custom_id || '').replace(/\D/g, ''), 10) || 0;
        if (cida !== cidb) return cida - cidb;
        const oa = typeof a.delivery_order === 'number' ? a.delivery_order : 999999;
        const ob = typeof b.delivery_order === 'number' ? b.delivery_order : 999999;
        if (oa !== ob) return oa - ob;
        const ida = parseInt(String(a.custom_id || '').replace(/\D/g, ''), 10) || 0;
        const idb = parseInt(String(b.custom_id || '').replace(/\D/g, ''), 10) || 0;
        return ida - idb;
      }
    });
    return arr;
  }, [customers, hideFullyPaid, filterMode, remainingMap, viewMode]);


  // 選択合計は「手入力した金額のみ」を集計する（自動的に残額を充当しない）
  const totalSelected = useMemo(() => {
    return customers.reduce((sum, c) => {
      if (!checked[c.id]) return sum;
      const entered = amounts[c.id] || 0;
      return sum + (entered > 0 ? entered : 0);
    }, 0);
  }, [customers, checked, amounts]);

  // 確認ダイアログを開く
  const openConfirm = (amountMap: Record<number, number>, mode: 'auto' | 'manual') => {
    const entries = customers
      .filter(c => checked[c.id] && confirmedMap[c.id])
      .map(c => {
        const remaining = remainingMap[c.id] || 0;
        const amount = Math.min(Math.max(amountMap[c.id] || 0, 0), remaining);
        return { customer_id: c.id, name: `${pad7(c.custom_id)} ${c.customer_name}`, remaining, amount };
      })
      .filter(e => e.amount > 0);
    const total = entries.reduce((s, e) => s + e.amount, 0);
    setConfirmEntries(entries);
    setConfirmTotal(total);
    setConfirmMode(mode);
    setConfirmAmountMap(amountMap);
    setConfirmOpen(true);
  };

  // 確認後に実行
  const handleConfirmProceed = async () => {
    const map = confirmAmountMap || {};
    await registerWithAmounts(map);
    setConfirmOpen(false);
  };

  // 自動入金：選択された顧客の残額を自動入力して入金処理を実行
  const handleAutoPayment = async () => {
    const checkedCustomers = customers.filter(c => checked[c.id] && confirmedMap[c.id] && (remainingMap[c.id] || 0) > 0);
    if (checkedCustomers.length === 0) {
      setMessage('選択された顧客がありません。確定済みで残額がある顧客を選択してください。');
      return;
    }

    // 選択された顧客の残額を自動入力
    const nextAmounts: Record<number, number> = {};
    checkedCustomers.forEach(c => {
      const rem = remainingMap[c.id] || 0;
      if (rem > 0) {
        nextAmounts[c.id] = rem;
      }
    });
    setAmounts(nextAmounts);

    // 自動入力後、確認ダイアログを表示
    openConfirm(nextAmounts, 'auto');
  };

  // 入金処理（指定された金額マップを使用）
  const registerWithAmounts = async (amountMap?: Record<number, number>) => {
    try {
      setRegistering(true);
      setMessage('');
      const entries = customers
        .filter(c => checked[c.id] && confirmedMap[c.id])
        .map(c => {
          const rem = remainingMap[c.id] || 0;
          const override = amountMap ? (amountMap[c.id] || 0) : (amounts[c.id] || 0);
          const planned = override > 0 ? Math.min(override, rem) : 0;
          return { customer_id: c.id, amount: planned, note };
        })
        .filter(e => e.amount > 0);
      if (entries.length === 0) {
        setMessage('チェック済みで入金額が入力された顧客がありません（未確定の顧客は選択できません）');
        return;
      }
      const resp = await fetchWithTimeout('/api/customers/payments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, entries, method }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMessage(`エラー: ${json?.error || resp.statusText}`);
      } else {
        setMessage(`登録完了: 成功 ${json.success} 件 / 失敗 ${json.failed} 件`);
        if (typeof courseId === 'number') {
          const paidMap = await fetchPaymentsSumMap(courseId, year, month);
          setPaidTotals(prev => ({ ...prev, ...paidMap }));
        } else {
          // 全コース表示時は全コースのpaidTotalsを再構成
          const paidAll: Record<number, number> = {};
          for (const co of courses) {
            const pm = await fetchPaymentsSumMap(co.id, year, month);
            Object.assign(paidAll, pm);
          }
          setPaidTotals(paidAll);
        }
        setChecked({});
        setAmounts({});
      }
    } catch (e) {
      console.error('一括入金登録に失敗（タイムアウト/ネットワーク）:', e);
      setMessage('登録に失敗しました（ネットワーク/タイムアウト）');
    } finally {
      setRegistering(false);
    }
  };

  // 通常の入金登録（手動入力金額）→ 確認ダイアログを表示
  const register = async () => {
    const map: Record<number, number> = {};
    Object.keys(checked).forEach(k => {
      const id = Number(k);
      if (checked[id]) map[id] = amounts[id] || 0;
    });
    openConfirm(map, 'manual');
  };

  // 選択された顧客数と残額合計を計算
  const selectedCustomersCount = useMemo(() => {
    return customers.filter(c => checked[c.id] && confirmedMap[c.id] && (remainingMap[c.id] || 0) > 0).length;
  }, [customers, checked, confirmedMap, remainingMap]);

  const selectedRemainingTotal = useMemo(() => {
    return customers
      .filter(c => checked[c.id] && confirmedMap[c.id])
      .reduce((sum, c) => sum + (remainingMap[c.id] || 0), 0);
  }, [customers, checked, confirmedMap, remainingMap]);

  const handleLoadData = async () => {
    setLoaded(false);
    if (viewMode === 'allCourses') {
      await loadAllCoursesData();
    } else if (typeof courseId === 'number') {
      await loadCustomers(courseId);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom>{readOnly ? '集金一覧表' : `一括入金（${method === 'debit' ? '引き落し' : '集金'}）`}</Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField 
              label="対象年月（入金月）" 
              type="month" 
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                if (y && m) {
                  setYear(y);
                  setMonth(m);
                }
              }}
              fullWidth 
              InputLabelProps={{ shrink: true }}
              data-testid="input-month-bulk"
            />
            <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
              請求参照: {invoiceYear}年{String(invoiceMonth).padStart(2, '0')}月（前月分）
            </Typography>
          </Grid>

          <Grid item xs={12} sm={readOnly ? 6 : 8}>
            <ToggleButtonGroup exclusive value={viewMode} onChange={(_, v) => v && (setViewMode(v), setLoaded(false))} size="small" data-testid="group-view-mode">
              <ToggleButton value="allCourses">全コース</ToggleButton>
              <ToggleButton value="perCourse">コース毎</ToggleButton>
            </ToggleButtonGroup>
          </Grid>

          {viewMode === 'perCourse' && (
            <Grid item xs={12} sm={8}>
              <Select fullWidth displayEmpty value={courseId} onChange={onChangeCourse} data-testid="select-course-bulk">
                <MenuItem value="__ALL__">全コース</MenuItem>
                <MenuItem value=""><em>コースを選択…</em></MenuItem>
                {courses.map(co => (
                  <MenuItem key={co.id} value={co.id}>{co.custom_id} {co.course_name}</MenuItem>
                ))}
              </Select>
            </Grid>
          )}

          <Grid item xs={12} sm={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="contained"
                onClick={handleLoadData}
                disabled={loading || (viewMode === 'perCourse' && typeof courseId !== 'number' && courseId !== '__ALL__')}
                data-testid="btn-load-bulk"
              >
                読み込み
              </Button>
              {loading && <CircularProgress size={28} />}
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
              {!readOnly && (
                <>
                  <FormControlLabel 
                    control={<Checkbox onChange={(e) => setAllChecked(e.target.checked)} />} 
                    label="全選択/解除" 
                  />
                  <FormControlLabel 
                    control={<Checkbox checked={hideFullyPaid} onChange={(e) => setHideFullyPaid(e.target.checked)} />} 
                    label="完全入金済みを隠す" 
                  />
                  <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
                    {selectedCustomersCount > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        選択中: {selectedCustomersCount}件（残額合計: ￥{selectedRemainingTotal.toLocaleString()}）
                      </Typography>
                    )}
                    <Button 
                      variant="contained" 
                      color="primary"
                      onClick={handleAutoPayment} 
                      disabled={registering || selectedCustomersCount === 0 || (viewMode === 'perCourse' && !courseId)}
                      data-testid="btn-auto-payment"
                    >
                      自動入金
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={register} 
                      disabled={registering || (totalSelected === 0 && selectedRemainingTotal === 0) || (viewMode === 'perCourse' && !courseId)}
                      data-testid="btn-register-manual"
                    >
                      手動入金登録
                    </Button>
                  </Box>
                </>
              )}
              {readOnly && (
                <ToggleButtonGroup exclusive value={filterMode} onChange={(_, v) => v && setFilterMode(v)} size="small">
                  <ToggleButton value="all">表示: 全集金方法</ToggleButton>
                  <ToggleButton value="collectionOnly">表示: 集金のみ</ToggleButton>
                  <ToggleButton value="debitOnly">表示: 引き落しのみ</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {message && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{message}</Typography>
      )}

      <Paper sx={{ p: 2 }}>
        {loaded && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              請求対象: {invoiceYear}年{String(invoiceMonth).padStart(2, '0')}月分 ／ 入金対象: {year}年{String(month).padStart(2, '0')}月入金分
            </Typography>
          </Box>
        )}

        {customersSorted.length === 0 ? (
          <Typography color="text.secondary">{loaded ? (viewMode === 'perCourse' ? '該当する顧客がいません。' : '全コースで該当する顧客がいません。') : '対象年月とコースを選択し、読み込みボタンを押してください。'}</Typography>
        ) : (
          <Grid container spacing={1}>
            {customersSorted.map((c, idx) => (
              <React.Fragment key={c.id}>
                {readOnly && viewMode === 'allCourses' && (idx === 0 || (customersSorted[idx - 1].course_custom_id || '') !== (c.course_custom_id || '')) && (
                  <Grid item xs={12} sx={{ bgcolor: '#fafafa', py: 0.5, px: 1, borderTop: '2px solid #ddd', borderBottom: '1px solid #eee' }}>
                    <Typography variant="subtitle2">コース {c.course_custom_id || ''} {c.course_name || ''}</Typography>
                  </Grid>
                )}
                <Grid container spacing={1} alignItems="center" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
                  {readOnly ? (
                    <>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2">{pad7(c.custom_id)} {c.customer_name}{viewMode === 'allCourses' ? `（${c.course_custom_id || ''} ${c.course_name || ''}）` : ''} [{c.billing_method === 'debit' ? '引き落し' : '集金'}]</Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <Typography variant="body2" sx={{ textAlign: 'right', color: confirmedMap[c.id] ? 'inherit' : '#b71c1c' }}>
                          請求額: ￥{(invoiceAmounts[c.id] || 0).toLocaleString()} {confirmedMap[c.id] ? '（確定済）' : '（未確定）'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <Typography variant="body2" sx={{ textAlign: 'right' }}>
                          入金済: ￥{(paidTotals[c.id] || 0).toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: (remainingMap[c.id] || 0) <= 0 ? 500 : undefined }}>
                          残額: ￥{(remainingMap[c.id] || 0).toLocaleString()}
                        </Typography>
                      </Grid>
                    </>
                  ) : (
                    <>
                      <Grid item xs={12} sm={1}>
                        {(() => {
                          const disabled = (remainingMap[c.id] || 0) <= 0 || !confirmedMap[c.id];
                          const reason = !confirmedMap[c.id] ? '未確定のため選択不可' : ((remainingMap[c.id] || 0) <= 0 ? '残額がありません' : '');
                          return (
                            <Tooltip title={disabled ? reason : ''}>
                              <span>
                                <Checkbox
                                  checked={!!checked[c.id]}
                                  onChange={(e) => toggleCheck(c.id, e.target.checked)}
                                  disabled={disabled}
                                />
                              </span>
                            </Tooltip>
                          );
                        })()}
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <Typography variant="body2">{pad7(c.custom_id)} {c.customer_name}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <Typography variant="body2" sx={{ textAlign: 'right', color: confirmedMap[c.id] ? 'inherit' : '#b71c1c' }}>
                          請求額: ￥{(invoiceAmounts[c.id] || 0).toLocaleString()} {confirmedMap[c.id] ? '（確定済）' : '（未確定）'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <Typography variant="body2" sx={{ textAlign: 'right' }}>
                          入金済: ￥{(paidTotals[c.id] || 0).toLocaleString()}（{year}年{String(month).padStart(2, '0')}月入金分）
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: (remainingMap[c.id] || 0) <= 0 ? 500 : undefined }}>
                          残額: ￥{(remainingMap[c.id] || 0).toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={2}>
                        <TextField
                          label="入金額"
                          type="number"
                          value={amounts[c.id] ?? ''}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || '0', 10) || 0;
                            setAmounts(prev => ({ ...prev, [c.id]: v }));
                          }}
                          inputProps={{ min: 0, max: remainingMap[c.id] || 0 }}
                          fullWidth
                          disabled={(remainingMap[c.id] || 0) <= 0 || !confirmedMap[c.id]}
                          helperText={amounts[c.id] ? `残額: ￥${(remainingMap[c.id] || 0).toLocaleString()}` : ''}
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
              </React.Fragment>
            ))}
          </Grid>
        )}
      </Paper>
      {/* 確認ダイアログ */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>一括入金の確認（{confirmMode === 'auto' ? '自動入金' : '手動入金'}）</DialogTitle>
        <DialogContent dividers>
          {confirmEntries.length === 0 ? (
            <Typography color="text.secondary">対象がありません。</Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                対象件数: {confirmEntries.length} 件 / 合計金額: ￥{confirmTotal.toLocaleString()}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>顧客</TableCell>
                    <TableCell align="right">残額</TableCell>
                    <TableCell align="right">入金額</TableCell>
                    <TableCell align="right">差額</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {confirmEntries.map(row => (
                    <TableRow key={row.customer_id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell align="right">￥{row.remaining.toLocaleString()}</TableCell>
                      <TableCell align="right">￥{row.amount.toLocaleString()}</TableCell>
                      <TableCell align="right">￥{(row.remaining - row.amount).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={handleConfirmProceed} disabled={confirmEntries.length === 0}>実行する</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}