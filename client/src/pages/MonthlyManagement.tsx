import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  TextField,
  Button,
  Snackbar,
  Alert,
  Divider,
  CircularProgress,
} from '@mui/material';
import axios from 'axios';
import moment from 'moment';

interface Course {
  id: number;
  custom_id?: string;
  course_name: string;
}

interface Customer {
  id: number;
  customer_name: string;
}

interface StatusRow {
  customer_id: number;
  confirmed: boolean;
  amount?: number;
}

const MonthlyManagement: React.FC = () => {
  const now = moment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [year, setYear] = useState<number>(now.year());
  const [month, setMonth] = useState<number>(now.month() + 1); // moment month 0-11
  const [loadingCourses, setLoadingCourses] = useState<boolean>(true);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);
  const [statusRows, setStatusRows] = useState<StatusRow[]>([]);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = useState<string>('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const fetchCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await axios.get('/api/masters/courses');
      setCourses(res.data || []);
    } catch (e) {
      console.error('コース一覧取得失敗', e);
    } finally {
      setLoadingCourses(false);
    }
  };

  const fetchStatusForCourse = async (courseId: number, y: number, m: number) => {
    setLoadingStatus(true);
    try {
      const customers: Customer[] = await (await axios.get(`/api/customers/by-course/${courseId}`)).data;
      const rows: StatusRow[] = [];
      for (const c of customers) {
        try {
          const resp = await axios.get(`/api/customers/${c.id}/invoices/status`, { params: { year: y, month: m } });
          const data = resp.data;
          rows.push({ customer_id: c.id, confirmed: !!data.confirmed, amount: data.amount });
        } catch (e) {
          rows.push({ customer_id: c.id, confirmed: false });
        }
      }
      setStatusRows(rows);
    } catch (e) {
      console.error('ステータス取得失敗', e);
      setStatusRows([]);
    } finally {
      setLoadingStatus(false);
    }
  };

  const confirmedCount = useMemo(() => statusRows.filter(r => r.confirmed).length, [statusRows]);

  const handleConfirmBatch = async () => {
    if (!selectedCourseId || !year || !month) {
      setSnackbarMsg('コース・年・月を選択してください');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    try {
      const body = { year, month, course_id: selectedCourseId };
      const res = await axios.post('/api/customers/invoices/confirm-batch', body);
      const count = res.data?.count ?? 0;
      setSnackbarMsg(`月次確定が完了しました（${count}件）`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      await fetchStatusForCourse(Number(selectedCourseId), year, month);
    } catch (e: any) {
      const msg = e?.response?.data?.error || '月次確定に失敗しました';
      setSnackbarMsg(msg);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleUnconfirmBatch = async () => {
    if (!selectedCourseId || !year || !month) {
      setSnackbarMsg('コース・年・月を選択してください');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    const ok = window.confirm('選択中のコースの指定年月の月次確定を解除します。よろしいですか？');
    if (!ok) return;
    try {
      const body = { year, month, course_id: selectedCourseId };
      const res = await axios.post('/api/customers/invoices/unconfirm-batch', body);
      const count = res.data?.count ?? 0;
      setSnackbarMsg(`月次確定の解除が完了しました（${count}件）`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      await fetchStatusForCourse(Number(selectedCourseId), year, month);
    } catch (e: any) {
      const msg = e?.response?.data?.error || '月次確定の解除に失敗しました';
      setSnackbarMsg(msg);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourseId && year && month) {
      fetchStatusForCourse(Number(selectedCourseId), year, month);
    } else {
      setStatusRows([]);
    }
  }, [selectedCourseId, year, month]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        月次管理
      </Typography>
      <Card>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel id="course-select-label">コース</InputLabel>
                <Select
                  labelId="course-select-label"
                  label="コース"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(typeof e.target.value === 'number' ? e.target.value : Number(e.target.value))}
                >
                  {loadingCourses && <MenuItem value=""><CircularProgress size={20} /> 読み込み中...</MenuItem>}
                  {!loadingCourses && courses.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.custom_id ? `${c.custom_id} - ${c.course_name}` : c.course_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <TextField
                label="年"
                type="number"
                size="small"
                fullWidth
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value || '0', 10))}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel id="month-select-label">月</InputLabel>
                <Select
                  labelId="month-select-label"
                  label="月"
                  value={month}
                  onChange={(e) => setMonth(typeof e.target.value === 'number' ? e.target.value : Number(e.target.value))}
                >
                  {monthOptions.map((m) => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              <Button variant="contained" color="primary" sx={{ mr: 1 }} onClick={handleConfirmBatch} disabled={!selectedCourseId}>月次確定</Button>
              <Button variant="outlined" color="secondary" onClick={handleUnconfirmBatch} disabled={!selectedCourseId}>確定解除</Button>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Box>
            <Typography variant="subtitle1" gutterBottom>
              ステータス（{selectedCourseId ? `コースID: ${selectedCourseId}` : 'コース未選択'} / {year}年 {month}月）
            </Typography>
            {loadingStatus ? (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CircularProgress size={20} sx={{ mr: 1 }} /> 読み込み中...
              </Box>
            ) : (
              <Typography variant="body2">
                確定済み: {confirmedCount} 件 / 合計顧客: {statusRows.length} 件
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)}>
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MonthlyManagement;