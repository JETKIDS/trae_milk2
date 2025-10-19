import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Container, FormControlLabel, Grid, MenuItem, Paper, Select, TextField, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { pad7 } from '../utils/id';

interface Course { id: number; custom_id: string; course_name: string; }
interface Customer { id: number; custom_id: string; customer_name: string; billing_method?: string; rounding_enabled?: number; course_name?: string; course_custom_id?: string; delivery_order?: number }
interface InvoiceItem { customer_id: number; amount: number; confirmed: boolean; rounding_enabled: number }

const now = new Date();

export default function BulkCollection({ method = 'collection', readOnly = false }: { method?: 'collection' | 'debit' | 'both'; readOnly?: boolean }) {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [amounts, setAmounts] = useState<Record<number, number>>({}); // 手入力（任意）
  const [invoiceAmounts, setInvoiceAmounts] = useState<Record<number, number>>({}); // 指定月請求額（満額）
  const [paidTotals, setPaidTotals] = useState<Record<number, number>>({}); // 指定月入金済み合計（金額）
  const [confirmedMap, setConfirmedMap] = useState<Record<number, boolean>>({});
  const [commonAmount, setCommonAmount] = useState<number>(0);
  const [note, setNote] = useState<string>(method === 'debit' ? '引き落し一括登録' : '集金一括登録');
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');
  const [hideFullyPaid, setHideFullyPaid] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'perCourse' | 'allCourses'>(readOnly ? 'allCourses' : 'perCourse');
  const [filterMode, setFilterMode] = useState<'all' | 'collectionOnly' | 'debitOnly'>('all');

  useEffect(() => {
    const loadCourses = async () => {
      const resp = await fetch('/api/masters/courses');
      const rows: Course[] = await resp.json();
      setCourses(rows);
    };
    loadCourses();
  }, []);

  const fetchInvoicesAmounts = async (cid: number, y: number, m: number, meth: 'collection' | 'debit') => {
    const resp = await fetch(`/api/customers/by-course/${cid}/invoices-amounts?year=${y}&month=${m}&method=${meth}`);
    const json: { items: InvoiceItem[] } = await resp.json();
    const invMap: Record<number, number> = {};
    const confMap: Record<number, boolean> = {};
    for (const it of (json.items || [])) {
      invMap[it.customer_id] = it.amount;
      confMap[it.customer_id] = !!it.confirmed;
    }
    return { invMap, confMap };
  };

  const fetchInvoicesAmountsMerged = async (cid: number, y: number, m: number) => {
    const coll = await fetchInvoicesAmounts(cid, y, m, 'collection');
    const deb = await fetchInvoicesAmounts(cid, y, m, 'debit');
    return { invMap: { ...coll.invMap, ...deb.invMap }, confMap: { ...coll.confMap, ...deb.confMap } };
  };

  const fetchPaymentsSumMap = async (cid: number, y: number, m: number) => {
    const resp = await fetch(`/api/customers/by-course/${cid}/payments-sum?year=${y}&month=${m}`);
    const json: { items: { customer_id: number; total: number }[] } = await resp.json();
    const paidMap: Record<number, number> = {};
    for (const it of (json.items || [])) {
      paidMap[it.customer_id] = it.total || 0;
    }
    return paidMap;
  };

  const loadCustomers = async (cid: number) => {
    const co = courses.find(c => c.id === cid);
    const addCourseInfo = (list: Customer[]) => list.map(c => ({ ...c, course_name: co?.course_name, course_custom_id: co?.custom_id }));
    let rows: Customer[] = [];
    if (readOnly || method === 'both') {
      const respC = await fetch(`/api/customers/by-course/${cid}/collection`);
      const coll: Customer[] = await respC.json();
      const respD = await fetch(`/api/customers/by-course/${cid}/debit`);
      const deb: Customer[] = await respD.json();
      rows = addCourseInfo(coll.map(c => ({ ...c, billing_method: c.billing_method || 'collection' })))
        .concat(addCourseInfo(deb.map(c => ({ ...c, billing_method: c.billing_method || 'debit' }))));
    } else {
      const resp = await fetch(`/api/customers/by-course/${cid}/${method === 'debit' ? 'debit' : 'collection'}`);
      const list: Customer[] = await resp.json();
      rows = addCourseInfo(list.map(c => ({ ...c, billing_method: c.billing_method || (method === 'debit' ? 'debit' : 'collection') })));
    }
    setCustomers(rows);
    setChecked({});
    setAmounts({});
    const { invMap, confMap } = await fetchInvoicesAmountsMerged(cid, year, month);
    setInvoiceAmounts(prev => ({ ...prev, ...invMap }));
    setConfirmedMap(prev => ({ ...prev, ...confMap }));
    const paidMap = await fetchPaymentsSumMap(cid, year, month);
    setPaidTotals(prev => ({ ...prev, ...paidMap }));
  };

  const loadAllCoursesData = async () => {
    const invAll: Record<number, number> = {};
    const confAll: Record<number, boolean> = {};
    const paidAll: Record<number, number> = {};
    let allRows: Customer[] = [];
    for (const co of courses) {
      let rows: Customer[] = [];
      if (readOnly || method === 'both') {
        const respC = await fetch(`/api/customers/by-course/${co.id}/collection`);
        const coll: Customer[] = await respC.json();
        const respD = await fetch(`/api/customers/by-course/${co.id}/debit`);
        const deb: Customer[] = await respD.json();
        rows = coll.map(c => ({ ...c, billing_method: c.billing_method || 'collection', course_name: co.course_name, course_custom_id: co.custom_id }))
          .concat(deb.map(c => ({ ...c, billing_method: c.billing_method || 'debit', course_name: co.course_name, course_custom_id: co.custom_id })));
      } else {
        const resp = await fetch(`/api/customers/by-course/${co.id}/${method === 'debit' ? 'debit' : 'collection'}`);
        const list: Customer[] = await resp.json();
        rows = list.map(c => ({ ...c, billing_method: c.billing_method || (method === 'debit' ? 'debit' : 'collection'), course_name: co.course_name, course_custom_id: co.custom_id }));
      }
      allRows = allRows.concat(rows);
      const { invMap, confMap } = await fetchInvoicesAmountsMerged(co.id, year, month);
      Object.assign(invAll, invMap);
      Object.assign(confAll, confMap);
      const paidMap = await fetchPaymentsSumMap(co.id, year, month);
      Object.assign(paidAll, paidMap);
    }
    setCustomers(allRows);
    setChecked({});
    setAmounts({});
    setInvoiceAmounts(invAll);
    setConfirmedMap(confAll);
    setPaidTotals(paidAll);
  };

  const onChangeCourse = async (e: any) => {
    const v = e.target.value;
    setCourseId(v);
    if (v && typeof v === 'number') {
      await loadCustomers(v);
    }
  };

  useEffect(() => {
    if (viewMode === 'perCourse') {
      if (typeof courseId === 'number') {
        loadCustomers(courseId);
      } else {
        setCustomers([]);
        setInvoiceAmounts({});
        setPaidTotals({});
        setConfirmedMap({});
      }
    } else {
      if (courses.length > 0) {
        loadAllCoursesData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, courseId, year, month, courses, method]);

  const toggleCheck = (id: number, value: boolean) => {
    setChecked(prev => ({ ...prev, [id]: value }));
  };

  const setAllChecked = (value: boolean) => {
    const next: Record<number, boolean> = {};
    customers.forEach(c => { next[c.id] = value && !!confirmedMap[c.id] && ((remainingMap[c.id] || 0) > 0); });
    setChecked(next);
  };

  const applyCommonAmount = () => {
    if (!commonAmount || commonAmount <= 0) return;
    const next: Record<number, number> = { ...amounts };
    customers.forEach(c => {
      if (checked[c.id]) {
        const rem = remainingMap[c.id] || 0;
        next[c.id] = Math.min(commonAmount, rem);
      }
    });
    setAmounts(next);
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


  const totalSelected = useMemo(() => {
    return customers.reduce((sum, c) => {
      if (!checked[c.id]) return sum;
      const rem = remainingMap[c.id] || 0;
      const override = amounts[c.id];
      const planned = override && override > 0 ? Math.min(override, rem) : rem;
      return sum + (isNaN(planned) ? 0 : planned);
    }, 0);
  }, [customers, checked, remainingMap, amounts]);

  const register = async () => {
    try {
      setRegistering(true);
      setMessage('');
      const entries = customers
        .filter(c => checked[c.id] && confirmedMap[c.id])
        .map(c => {
          const rem = remainingMap[c.id] || 0;
          const override = amounts[c.id];
          const planned = override && override > 0 ? Math.min(override, rem) : rem;
          return { customer_id: c.id, amount: planned, note };
        });
      if (entries.length === 0) {
        setMessage('チェック済みで金額が設定された顧客がありません（未確定の顧客は選択できません）');
        return;
      }
      // 金額0は除外
      const filtered = entries.filter(e => e.amount && e.amount > 0);
      if (filtered.length === 0) {
        setMessage('残額がないため登録できません');
        return;
      }
      const resp = await fetch('/api/customers/payments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, entries: filtered, method })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMessage(`エラー: ${json?.error || resp.statusText}`);
      } else {
        setMessage(`登録完了: 成功 ${json.success} 件 / 失敗 ${json.failed} 件`);
        // 登録後は入金済み合計を再取得して残額を更新し、選択状態と手入力額をクリア
        if (typeof courseId === 'number') {
          const paidMap = await fetchPaymentsSumMap(courseId, year, month);
          setPaidTotals(prev => ({ ...prev, ...paidMap }));
        }
        setChecked({});
        setAmounts({});
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom>{readOnly ? '集金一覧表' : `コース別 一括入金（${method === 'debit' ? '引き落し' : '集金'}）`}</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField label="対象年" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value || '0', 10))} fullWidth />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField label="対象月" type="number" value={month} onChange={(e) => setMonth(parseInt(e.target.value || '0', 10))} fullWidth />
          </Grid>
          <Grid item xs={12} sm={6}>
            {readOnly ? (
              <ToggleButtonGroup exclusive value={viewMode} onChange={(_, v) => v && setViewMode(v)} size="small">
                <ToggleButton value="allCourses">全コース</ToggleButton>
                <ToggleButton value="perCourse">コース毎</ToggleButton>
              </ToggleButtonGroup>
            ) : (
              <Box />
            )}
          </Grid>
          {viewMode === 'perCourse' && (
            <Grid item xs={12} sm={6}>
              <Select fullWidth displayEmpty value={courseId} onChange={onChangeCourse}>
                <MenuItem value=""><em>コースを選択…</em></MenuItem>
                {courses.map(co => (
                  <MenuItem key={co.id} value={co.id}>{co.custom_id} {co.course_name}</MenuItem>
                ))}
              </Select>
            </Grid>
          )}
          <Grid item xs={12}>
            <Box display="flex" gap={2} alignItems="center" justifyContent="flex-end">
              {!readOnly && (
                <>
                  <FormControlLabel control={<Checkbox onChange={(e) => setAllChecked(e.target.checked)} />} label="全選択/解除" />
                  <TextField label="一括金額" type="number" value={commonAmount} onChange={(e) => setCommonAmount(parseInt(e.target.value || '0', 10))} />
                  <Button variant="outlined" onClick={applyCommonAmount}>一括金額を反映</Button>
                </>
              )}
              <FormControlLabel control={<Checkbox checked={hideFullyPaid} onChange={(e) => setHideFullyPaid(e.target.checked)} />} label="完全入金済みを隠す" />
              {readOnly && (
                <ToggleButtonGroup exclusive value={filterMode} onChange={(_, v) => v && setFilterMode(v)} size="small">
                  <ToggleButton value="all">表示: 全集金方法</ToggleButton>
                  <ToggleButton value="collectionOnly">表示: 集金のみ</ToggleButton>
                  <ToggleButton value="debitOnly">表示: 引き落しのみ</ToggleButton>
                </ToggleButtonGroup>
              )}
              {!readOnly && (
                <>
                  <TextField label="メモ" value={note} onChange={(e) => setNote(e.target.value)} sx={{ minWidth: 240 }} />
                  <Typography>選択合計（登録予定）: ￥{totalSelected.toLocaleString()}</Typography>
                  <Button variant="contained" onClick={register} disabled={registering || !courseId}>一括入金登録</Button>
                </>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2 }}>
        {customersSorted.length === 0 ? (
          <Typography color="text.secondary">{viewMode === 'perCourse' ? 'コースを選択すると一覧が表示されます。' : '全コースの一覧を表示します（対象条件に該当する顧客がいません）。'}</Typography>
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
                        <Checkbox
                          checked={!!checked[c.id]}
                          onChange={(e) => toggleCheck(c.id, e.target.checked)}
                          disabled={(remainingMap[c.id] || 0) <= 0 || !confirmedMap[c.id]}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Typography variant="body2">{pad7(c.custom_id)} {c.customer_name}</Typography>
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
                  )}
                </Grid>
              </React.Fragment>
            ))}
          </Grid>
        )}
      </Paper>
    </Container>
  );
}