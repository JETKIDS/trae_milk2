import React, { useEffect, useMemo, useState } from 'react';
import { Box, Grid, TextField, FormControl, InputLabel, Select, MenuItem, ToggleButtonGroup, ToggleButton, Button, Typography, Table, TableHead, TableRow, TableCell, TableBody, Stack, CircularProgress, Alert } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { pad7 } from '../utils/id';
import { getPrevYearMonth, parseMonthInput } from '../utils/date';
import { openCustomerStandalone } from '../utils/window';

type MethodFilter = 'all' | 'collection' | 'debit';
type ListType = 'paid' | 'unpaid';

interface Course { id: number; custom_id?: string; course_name: string }

interface PaymentsSumItem { customer_id: number; total: number }
interface InvoiceAmountItem { customer_id: number; amount: number; confirmed: boolean }
interface CustomerBasic { id: number; custom_id?: string; customer_name: string }

export default function PaymentDetails() {
  const now = new Date();
  const [monthStr, setMonthStr] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [listType, setListType] = useState<ListType>('paid');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ
  const [paymentsMap, setPaymentsMap] = useState<Record<number, number>>({}); // 当月入金合計
  const [invoicesMap, setInvoicesMap] = useState<Record<number, number>>({}); // 前月請求額
  const [customersMap, setCustomersMap] = useState<Record<number, CustomerBasic>>({}); // 顧客名など

  const parsed = parseMonthInput(monthStr);
  const y = parsed ? parsed.year : new Date().getFullYear();
  const m = parsed ? parsed.month : (new Date().getMonth() + 1);
  const { year: invY, month: invM } = getPrevYearMonth(y, m);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/masters/courses');
        setCourses(res.data || []);
      } catch (e) {
        console.error('コース一覧取得失敗', e);
      }
    })();
  }, []);

  const targetCourseIds: number[] = useMemo(() => {
    if (selectedCourseId === '') return courses.map(c => c.id);
    return typeof selectedCourseId === 'number' ? [selectedCourseId] : [];
  }, [selectedCourseId, courses]);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const nextPayments: Record<number, number> = {};
      const nextInvoices: Record<number, number> = {};
      const nextCustomers: Record<number, CustomerBasic> = {};

      // methodFilterに応じて対象顧客集合を制約するために顧客リストを取得
      const fetchCustomersByMethod = async (cid: number): Promise<CustomerBasic[]> => {
        if (methodFilter === 'collection') {
          const r = await apiClient.get(`/api/customers/by-course/${cid}/collection`);
          return (r.data || []).map((c: any) => ({ id: c.id, custom_id: c.custom_id, customer_name: c.customer_name }));
        } else if (methodFilter === 'debit') {
          const r = await apiClient.get(`/api/customers/by-course/${cid}/debit`);
          return (r.data || []).map((c: any) => ({ id: c.id, custom_id: c.custom_id, customer_name: c.customer_name }));
        } else {
          // all: collection + debit
          const r1 = await apiClient.get(`/api/customers/by-course/${cid}/collection`);
          const r2 = await apiClient.get(`/api/customers/by-course/${cid}/debit`);
          const a = (r1.data || []).concat(r2.data || []);
          return a.map((c: any) => ({ id: c.id, custom_id: c.custom_id, customer_name: c.customer_name }));
        }
      };

      for (const cid of targetCourseIds) {
        const baseCustomers = await fetchCustomersByMethod(cid);
        baseCustomers.forEach((c) => { nextCustomers[c.id] = c; });

        // 入金合計（当月）
        const pay = await apiClient.get(`/api/customers/by-course/${cid}/payments-sum`, { params: { year: y, month: m } });
        const payMap: Record<number, number> = {};
        (pay.data?.items || []).forEach((it: PaymentsSumItem) => { payMap[it.customer_id] = it.total || 0; });
        // 前月請求（顧客課金方法のフィルタで出し分け）
        const invMethod = methodFilter === 'debit' ? 'debit' : 'collection';
        const inv = await apiClient.get(`/api/customers/by-course/${cid}/invoices-amounts`, { params: { year: invY, month: invM, method: invMethod } });
        const invMap: Record<number, number> = {};
        (inv.data?.items || []).forEach((it: InvoiceAmountItem) => { invMap[it.customer_id] = it.amount || 0; });

        // 集計へ取り込み（対象顧客のみに限定）
        baseCustomers.forEach((c) => {
          if (typeof payMap[c.id] === 'number') nextPayments[c.id] = (nextPayments[c.id] || 0) + payMap[c.id];
          if (typeof invMap[c.id] === 'number') nextInvoices[c.id] = (nextInvoices[c.id] || 0) + invMap[c.id];
        });
      }

      setPaymentsMap(nextPayments);
      setInvoicesMap(nextInvoices);
      setCustomersMap(nextCustomers);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.error || e?.message || '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courses.length === 0) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStr, selectedCourseId, listType, methodFilter, courses]);

  const rows = useMemo(() => {
    const ids = Object.keys(customersMap).map((k) => Number(k));
    const data = ids.map((id) => {
      const c = customersMap[id];
      const paid = paymentsMap[id] || 0;
      const inv = invoicesMap[id] || 0;
      const rem = Math.max(inv - paid, 0);
      return { id, custom_id: c?.custom_id, name: c?.customer_name, paid, inv, rem };
    });
    if (listType === 'paid') {
      return data.filter(r => r.paid > 0).sort((a, b) => b.paid - a.paid);
    } else {
      return data.filter(r => r.rem > 0).sort((a, b) => b.rem - a.rem);
    }
  }, [customersMap, paymentsMap, invoicesMap, listType]);

  const summary = useMemo(() => {
    const count = rows.length;
    const amount = rows.reduce((sum, r) => sum + (listType === 'paid' ? r.paid : r.rem), 0);
    return { count, amount };
  }, [rows, listType]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>入金明細</Typography>
      <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Grid item xs={12} sm={3}>
          <TextField
            label="対象年月"
            type="month"
            value={monthStr}
            onChange={(e) => setMonthStr(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel id="course-select-label" shrink>対象コース</InputLabel>
            <Select
              labelId="course-select-label"
              label="対象コース"
              value={selectedCourseId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedCourseId(v === '' ? '' : Number(v));
              }}
              displayEmpty
              renderValue={() => {
                if (selectedCourseId === '') return '全コース';
                const c = courses.find(cc => cc.id === Number(selectedCourseId));
                return c ? `${c.custom_id ? `${pad7(c.custom_id)} ` : ''}${c.course_name}` : '';
              }}
            >
              <MenuItem value="">全コース</MenuItem>
              {courses.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.custom_id ? `${pad7(c.custom_id)} ` : ''}{c.course_name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
            <ToggleButtonGroup exclusive value={listType} onChange={(_, v) => v && setListType(v)} size="small">
              <ToggleButton value="paid">入金一覧</ToggleButton>
              <ToggleButton value="unpaid">未入金一覧</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup exclusive value={methodFilter} onChange={(_, v) => v && setMethodFilter(v)} size="small">
              <ToggleButton value="all">全て</ToggleButton>
              <ToggleButton value="collection">集金客</ToggleButton>
              <ToggleButton value="debit">引き落し客</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="outlined" onClick={load} disabled={loading}>再読込</Button>
          </Stack>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && (
        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant="body2" color="text.secondary">
            合計件数: {summary.count} 件／合計金額: ￥{summary.amount.toLocaleString()}
          </Typography>
        </Box>
      )}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">読み込み中...</Typography>
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>顧客ID</TableCell>
              <TableCell>顧客名</TableCell>
              {listType === 'unpaid' && <TableCell align="right">前月請求額</TableCell>}
              <TableCell align="right">当月入金</TableCell>
              {listType === 'unpaid' && <TableCell align="right">残額</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <Box
                    component="button"
                    onClick={() => openCustomerStandalone(r.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      color: '#1976d2',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  >
                    {pad7(r.custom_id || '')}
                  </Box>
                </TableCell>
                <TableCell>{r.name}</TableCell>
                {listType === 'unpaid' && <TableCell align="right">￥{r.inv.toLocaleString()}</TableCell>}
                <TableCell align="right">￥{r.paid.toLocaleString()}</TableCell>
                {listType === 'unpaid' && <TableCell align="right">￥{r.rem.toLocaleString()}</TableCell>}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary">対象データがありません。</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}


