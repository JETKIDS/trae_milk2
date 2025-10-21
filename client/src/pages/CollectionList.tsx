import React, { useState, useEffect } from 'react';
import { Container, Typography, Paper, Grid, Select, MenuItem, TextField, Button, Box, CircularProgress, ToggleButtonGroup, ToggleButton, Table, TableHead, TableRow, TableCell, TableBody, TableFooter } from '@mui/material';
import { pad7 } from '../utils/id';

interface Course { id: number; custom_id?: string; course_name: string }
interface Customer { id: number; custom_id: string; customer_name: string; course_name?: string }

interface LineItem {
  customerId: number;
  customId: string;
  customerName: string;
  prevInvoiceAmount: number;
  currentPaymentAmount: number;
  carryoverAmount: number;
  currentCollectionAmount: number;
  courseName?: string;
}

const now = new Date();

const CollectionList: React.FC = () => {
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | 'all' | ''>('');
  const [method, setMethod] = useState<'collection' | 'debit' | 'all'>('collection');
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [message, setMessage] = useState<string>('');

  // フェッチのタイムアウト対策（デフォルト30秒）
  const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit, timeoutMS: number = 30000) => {
    const controller = new AbortController();
    const id = window.setTimeout(() => controller.abort(), timeoutMS);
    try {
      const resp = await fetch(input, { ...(init || {}), signal: controller.signal });
      return resp;
    } finally {
      clearTimeout(id);
    }
  };

  // 集金一覧表専用の印刷向きヘルパー関数
  const injectCollectionListPrintStyle = () => {
    const styleId = 'collection-list-print-style';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @page {
        size: A4 portrait;
        margin: 3mm 8mm 3mm 8mm;
        @bottom-center { content: none; }
        @bottom-left { content: none; }
        @bottom-right { content: none; }
        @top-center { content: none; }
        @top-left { content: none; }
        @top-right { content: none; }
      }
      @media print {
        @page {
          margin: 3mm 8mm 3mm 8mm;
          @bottom-center { content: none; }
          @bottom-left { content: none; }
          @bottom-right { content: none; }
          @top-center { content: none; }
          @top-left { content: none; }
          @top-right { content: none; }
        }
        /* 集金一覧表の上部余白とタイトルをコンパクトに */
        .collection-list-root { margin-top: 0 !important; padding-top: 0 !important; }
        .collection-list-title { font-size: 14px !important; font-weight: 700 !important; line-height: 1.1 !important; margin-top: 0 !important; margin-bottom: 6px !important; text-align: center !important; }
        /* テーブルフッターが各ページに繰り返し出ないようにする（総合計は最後のページのみ）*/
        .collection-list-table thead { display: table-header-group !important; }
        .collection-list-table tfoot { display: table-row-group !important; }
        .collection-list-table tr { page-break-inside: avoid !important; }
      }
    `;
    document.head.appendChild(style);
  };

  const removeCollectionListPrintStyle = () => {
    const styleId = 'collection-list-print-style';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
  };

  // 印刷処理
  const handlePrint = () => {
    injectCollectionListPrintStyle();
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // 印刷前後のイベントリスナー
  useEffect(() => {
    const beforePrint = () => {
      injectCollectionListPrintStyle();
    };

    const afterPrint = () => {
      removeCollectionListPrintStyle();
    };

    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);

    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      removeCollectionListPrintStyle();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetchWithTimeout('/api/masters/courses');
        const rows: Course[] = await resp.json();
        setCourses(rows || []);
      } catch (e) {
        console.error('コース一覧の取得に失敗しました', e);
      }
    })();
  }, []);

  const handleOutput = async () => {
    setMessage('');
    setItems([]);
    if (courseId === '') {
      setMessage('コースを選択してください');
      return;
    }
    if (!year || !month || month < 1 || month > 12) {
      setMessage('対象年/月を正しく入力してください');
      return;
    }

    setLoading(true);
    try {
      const targetCourseIds: number[] = courseId === 'all' ? courses.map(c => c.id) : [Number(courseId)];

      // 顧客一覧（選択した方法／全件時は両方）
      const customersAllRaw: Customer[] = [];
      for (const cid of targetCourseIds) {
        if (method === 'all') {
          const respC = await fetch(`/api/customers/by-course/${cid}/collection`);
          const coll: Customer[] = await respC.json();
          const respD = await fetch(`/api/customers/by-course/${cid}/debit`);
          const deb: Customer[] = await respD.json();
          if (Array.isArray(coll)) customersAllRaw.push(...coll);
          if (Array.isArray(deb)) customersAllRaw.push(...deb);
        } else {
          const resp = await fetch(`/api/customers/by-course/${cid}/${method === 'debit' ? 'debit' : 'collection'}`);
          const list: Customer[] = await resp.json();
          if (Array.isArray(list)) customersAllRaw.push(...list);
        }
      }
      // 重複排除（先に登場した方を採用）
      const seen = new Set<number>();
      const customersAll: Customer[] = [];
      for (const c of customersAllRaw) {
        if (!seen.has(c.id)) { seen.add(c.id); customersAll.push(c); }
      }

      if (customersAll.length === 0) {
        setMessage('対象に該当する顧客がいません');
        setItems([]);
        setLoading(false);
        return;
      }

      // 当月請求額（確定優先／未確定は試算）
      const invMap: Record<number, number> = {};
      for (const cid of targetCourseIds) {
        if (method === 'all') {
          const respInvC = await fetch(`/api/customers/by-course/${cid}/invoices-amounts?year=${year}&month=${month}&method=collection`);
          const invJsonC = await respInvC.json();
          (invJsonC.items || []).forEach((it: any) => { invMap[Number(it.customer_id)] = Number(it.amount) || 0; });
          const respInvD = await fetch(`/api/customers/by-course/${cid}/invoices-amounts?year=${year}&month=${month}&method=debit`);
          const invJsonD = await respInvD.json();
          (invJsonD.items || []).forEach((it: any) => { invMap[Number(it.customer_id)] = Number(it.amount) || 0; });
        } else {
          const respInv = await fetch(`/api/customers/by-course/${cid}/invoices-amounts?year=${year}&month=${month}&method=${method}`);
          const invJson = await respInv.json();
          (invJson.items || []).forEach((it: any) => { invMap[Number(it.customer_id)] = Number(it.amount) || 0; });
        }
      }

      // 各顧客の前月請求額／繰越額（ARサマリー）と当月入金額（顧客詳細と同じソース）
      const results: LineItem[] = [];
      // まとめて並列取得＋タイムアウト・エラーハンドリング
      const summarySettled = await Promise.allSettled(
        customersAll.map(async (c) => {
          try {
            const respSum = await fetchWithTimeout(`/api/customers/${c.id}/ar-summary?year=${year}&month=${month}`);
            const sumJson = await respSum.json();
            const prevInvoice = Number(sumJson?.prev_invoice_amount) || 0;
            const carryover = Number(sumJson?.carryover_amount) || 0;
            const currentInvoice = Number(invMap[c.id]) || 0;
            const currentPayment = Number(sumJson?.prev_payment_amount) || 0; // 顧客詳細画面の「入金額」（前月入金額）に合わせる

            const currentCollection = carryover + currentInvoice; // 今月に集金（または引き落し）すべき総額
            return {
              customerId: c.id,
              customId: c.custom_id,
              customerName: c.customer_name,
              prevInvoiceAmount: prevInvoice,
              currentPaymentAmount: currentPayment,
              carryoverAmount: carryover,
              currentCollectionAmount: currentCollection,
              courseName: c.course_name,
            } as LineItem;
          } catch (e) {
            console.error('ARサマリー/入金取得失敗', e);
            return {
              customerId: c.id,
              customId: c.custom_id,
              customerName: c.customer_name,
              prevInvoiceAmount: 0,
              currentPaymentAmount: 0,
              carryoverAmount: 0,
              currentCollectionAmount: Number(invMap[c.id]) || 0,
              courseName: c.course_name,
            } as LineItem;
          }
        })
      );

      for (const s of summarySettled) {
        if (s.status === 'fulfilled') {
          results.push(s.value);
        } else {
          // Promise が reject した場合のフォールバック（理論上上の catch で拾うためここはほぼ通らない）
          console.warn('ARサマリーの取得に失敗した顧客があります');
        }
      }

      // 並び順は取得順（コースごとの配達順）を尊重
      const orderMap = new Map<number, number>();
      customersAll.forEach((c, idx) => orderMap.set(c.id, idx));
      results.sort((a, b) => (orderMap.get(a.customerId) || 0) - (orderMap.get(b.customerId) || 0));

      setItems(results);
      setMessage(`出力件数: ${results.length}件`);
    } catch (e: any) {
      console.error('集金一覧表の出力に失敗しました', e);
      setMessage('集計の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 3 }} className="collection-list-root">
      <Typography variant="h5" gutterBottom className="print-title collection-list-title">集金一覧表</Typography>

      <Paper sx={{ p: 2, mb: 2, '@media print': { display: 'none' } }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField label="対象年" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value || '0', 10))} fullWidth />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField label="対象月" type="number" value={month} onChange={(e) => setMonth(parseInt(e.target.value || '0', 10))} fullWidth />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Select fullWidth displayEmpty value={courseId} onChange={(e) => setCourseId(e.target.value as any)}>
              <MenuItem value=""><em>コースを選択…</em></MenuItem>
              <MenuItem value="all">全コース</MenuItem>
              {courses.map(co => (
                <MenuItem key={co.id} value={co.id}>{co.custom_id} {co.course_name}</MenuItem>
              ))}
            </Select>
          </Grid>
          <Grid item xs={12}>
            <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
              <ToggleButtonGroup exclusive value={method} onChange={(_e, v) => v && setMethod(v)} size="small">
                <ToggleButton value="collection">集金</ToggleButton>
                <ToggleButton value="debit">引き落し</ToggleButton>
                <ToggleButton value="all">全件</ToggleButton>
              </ToggleButtonGroup>
              <Box display="flex" alignItems="center" gap={1}>
                <Button variant="contained" onClick={handleOutput} disabled={loading || courseId === ''}>出力</Button>
                <Button variant="outlined" onClick={handlePrint} disabled={items.length === 0}>印刷</Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 2 }}>
        {loading && (
          <Box display="flex" alignItems="center" gap={2}>
            <CircularProgress size={20} />
            <Typography variant="body2">集計中…</Typography>
          </Box>
        )}
        {!loading && message && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{message}</Typography>
        )}
        {!loading && items.length > 0 && (
          <Table size="small" className="collection-list-table">
            <TableHead>
              <TableRow>
                <TableCell>顧客ID</TableCell>
                <TableCell>顧客名</TableCell>
                <TableCell align="right">前月請求額</TableCell>
                <TableCell align="right">当月入金額</TableCell>
                <TableCell align="right">繰越額</TableCell>
                <TableCell align="right">今月集金額</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it, idx) => {
                const showCourseHeader = courseId === 'all' && ((idx === 0) || items[idx - 1]?.courseName !== it.courseName);
                return (
                  <React.Fragment key={`row-${it.customerId}`}>
                    {showCourseHeader && (
                      <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableCell colSpan={6} sx={{ fontWeight: 600 }}>{it.courseName || 'コース不明'}</TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell>{pad7(it.customId)}</TableCell>
                      <TableCell>{it.customerName}</TableCell>
                      <TableCell align="right">{it.prevInvoiceAmount.toLocaleString()}</TableCell>
                      <TableCell align="right">{it.currentPaymentAmount.toLocaleString()}</TableCell>
                      <TableCell align="right">{it.carryoverAmount.toLocaleString()}</TableCell>
                      <TableCell align="right">{it.currentCollectionAmount.toLocaleString()}</TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>合計</TableCell>
                <TableCell />
                <TableCell align="right">{items.reduce((sum, it) => sum + (it.prevInvoiceAmount || 0), 0).toLocaleString()}</TableCell>
                <TableCell align="right">{items.reduce((sum, it) => sum + (it.currentPaymentAmount || 0), 0).toLocaleString()}</TableCell>
                <TableCell align="right">{items.reduce((sum, it) => sum + (it.carryoverAmount || 0), 0).toLocaleString()}</TableCell>
                <TableCell align="right">{items.reduce((sum, it) => sum + (it.currentCollectionAmount || 0), 0).toLocaleString()}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Paper>
    </Container>
  );
};

export default CollectionList;