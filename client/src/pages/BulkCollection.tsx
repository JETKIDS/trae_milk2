import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Container, FormControlLabel, Grid, MenuItem, Paper, Select, TextField, Typography } from '@mui/material';
import { pad7 } from '../utils/id';

interface Course { id: number; custom_id: string; course_name: string; }
interface Customer { id: number; custom_id: string; customer_name: string; billing_method?: string; rounding_enabled?: number }
interface InvoiceItem { customer_id: number; amount: number; confirmed: boolean; rounding_enabled: number }

const now = new Date();

export default function BulkCollection() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | ''>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [amounts, setAmounts] = useState<Record<number, number>>({}); // 手入力（任意）
  const [invoiceAmounts, setInvoiceAmounts] = useState<Record<number, number>>({}); // 指定月請求額（満額）
  const [confirmedMap, setConfirmedMap] = useState<Record<number, boolean>>({});
  const [commonAmount, setCommonAmount] = useState<number>(0);
  const [note, setNote] = useState<string>('集金一括登録');
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadCourses = async () => {
      const resp = await fetch('/api/masters/courses');
      const rows: Course[] = await resp.json();
      setCourses(rows);
    };
    loadCourses();
  }, []);

  const loadCustomers = async (cid: number) => {
    const resp = await fetch(`/api/customers/by-course/${cid}/collection`);
    const rows: Customer[] = await resp.json();
    setCustomers(rows);
    setChecked({});
    setAmounts({});
    await loadInvoices(cid, year, month);
  };

  const onChangeCourse = async (e: any) => {
    const v = e.target.value;
    setCourseId(v);
    if (v && typeof v === 'number') {
      await loadCustomers(v);
    }
  };

  const loadInvoices = async (cid: number, y: number, m: number) => {
    const resp = await fetch(`/api/customers/by-course/${cid}/invoices-amounts?year=${y}&month=${m}`);
    const json: { items: InvoiceItem[] } = await resp.json();
    const invMap: Record<number, number> = {};
    const confMap: Record<number, boolean> = {};
    for (const it of (json.items || [])) {
      invMap[it.customer_id] = it.amount;
      confMap[it.customer_id] = !!it.confirmed;
    }
    setInvoiceAmounts(invMap);
    setConfirmedMap(confMap);
  };

  const toggleCheck = (id: number, value: boolean) => {
    setChecked(prev => ({ ...prev, [id]: value }));
  };

  const setAllChecked = (value: boolean) => {
    const next: Record<number, boolean> = {};
    customers.forEach(c => { next[c.id] = value; });
    setChecked(next);
  };

  const applyCommonAmount = () => {
    if (!commonAmount || commonAmount <= 0) return;
    const next: Record<number, number> = { ...amounts };
    customers.forEach(c => {
      if (checked[c.id]) next[c.id] = commonAmount;
    });
    setAmounts(next);
  };

  useEffect(() => {
    if (typeof courseId === 'number') {
      loadInvoices(courseId, year, month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const totalSelected = useMemo(() => {
    return customers.reduce((sum, c) => {
      if (!checked[c.id]) return sum;
      const amt = invoiceAmounts[c.id] || 0;
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
  }, [customers, checked, invoiceAmounts]);

  const register = async () => {
    try {
      setRegistering(true);
      setMessage('');
      const entries = customers
        .filter(c => checked[c.id])
        .map(c => ({ customer_id: c.id, amount: invoiceAmounts[c.id] || 0, note }));
      if (entries.length === 0) {
        setMessage('チェック済みで金額が設定された顧客がありません');
        return;
      }
      // 金額0は除外
      const filtered = entries.filter(e => e.amount && e.amount > 0);
      if (filtered.length === 0) {
        setMessage('請求額が取得できていないため登録できません');
        return;
      }
      const resp = await fetch('/api/customers/payments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, entries: filtered })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMessage(`エラー: ${json?.error || resp.statusText}`);
      } else {
        setMessage(`登録完了: 成功 ${json.success} 件 / 失敗 ${json.failed} 件`);
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom>コース別 一括入金（集金）</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField label="対象年" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value || '0', 10))} fullWidth />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField label="対象月" type="number" value={month} onChange={(e) => setMonth(parseInt(e.target.value || '0', 10))} fullWidth />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Select fullWidth displayEmpty value={courseId} onChange={onChangeCourse}>
              <MenuItem value=""><em>コースを選択…</em></MenuItem>
              {courses.map(co => (
                <MenuItem key={co.id} value={co.id}>{co.custom_id} {co.course_name}</MenuItem>
              ))}
            </Select>
          </Grid>
          <Grid item xs={12}>
            <Box display="flex" gap={2} alignItems="center" justifyContent="flex-end">
              <FormControlLabel control={<Checkbox onChange={(e) => setAllChecked(e.target.checked)} />} label="全選択/解除" />
              <TextField label="一括金額" type="number" value={commonAmount} onChange={(e) => setCommonAmount(parseInt(e.target.value || '0', 10))} />
              <Button variant="outlined" onClick={applyCommonAmount}>一括金額を反映</Button>
              <TextField label="メモ" value={note} onChange={(e) => setNote(e.target.value)} sx={{ minWidth: 240 }} />
              <Typography>選択合計: ￥{totalSelected.toLocaleString()}</Typography>
              <Button variant="contained" onClick={register} disabled={registering || !courseId}>一括入金登録</Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2 }}>
        {customers.length === 0 ? (
          <Typography color="text.secondary">コースを選択すると集金客が表示されます。</Typography>
        ) : (
          <Grid container spacing={1}>
            {customers.map(c => (
              <Grid key={c.id} container spacing={1} alignItems="center" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
                <Grid item xs={12} sm={1}>
                  <Checkbox checked={!!checked[c.id]} onChange={(e) => toggleCheck(c.id, e.target.checked)} />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <Typography variant="body2">{pad7(c.custom_id)} {c.customer_name}</Typography>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Typography variant="body2" sx={{ textAlign: 'right' }}>
                    請求額: ￥{(invoiceAmounts[c.id] || 0).toLocaleString()} {confirmedMap[c.id] ? '（確定済）' : ''}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Typography variant="caption" color="text.secondary">集金</Typography>
                </Grid>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>
      {message && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography color={message.startsWith('エラー') ? 'error' : 'primary'}>{message}</Typography>
        </Paper>
      )}
    </Container>
  );
}