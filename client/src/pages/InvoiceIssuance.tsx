import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Divider,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import axios from 'axios';
import { pad7 } from '../utils/id';
import { useNavigate } from 'react-router-dom';

interface Course {
  id: number;
  custom_id?: string;
  course_name: string;
}

interface CustomerRow {
  id: number;
  custom_id: string;
  customer_name: string;
  delivery_order?: number;
}

interface AmountItem {
  customer_id: number;
  amount: number;
  confirmed: boolean;
  rounding_enabled: number; // 1 or 0
}

const InvoiceIssuance: React.FC = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [outputMonth, setOutputMonth] = useState<string>(new Date().toISOString().slice(0,7)); // YYYY-MM
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [amounts, setAmounts] = useState<AmountItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const year = useMemo(() => {
    try { return parseInt(outputMonth.slice(0,4), 10); } catch { return new Date().getFullYear(); }
  }, [outputMonth]);
  const month = useMemo(() => {
    try { return parseInt(outputMonth.slice(5,7), 10); } catch { return new Date().getMonth() + 1; }
  }, [outputMonth]);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const res = await axios.get('/api/masters/courses');
        const list: Course[] = (res.data || []).map((c: any) => ({ id: c.id, custom_id: c.custom_id, course_name: c.course_name }));
        setCourses(list);
      } catch (e: any) {
        console.error('コース一覧の取得に失敗', e);
        setError('コース一覧の取得に失敗しました');
      }
    };
    loadCourses();
  }, []);

  // コース一覧取得後、未選択ならデフォルトを設定
  useEffect(() => {
    if (selectedCourseId === null && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const handleLoadList = async () => {
    if (!selectedCourseId) {
      setError('コースを選択してください');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [customersRes, amountsRes] = await Promise.all([
        axios.get(`/api/customers/by-course/${selectedCourseId}`),
        axios.get(`/api/customers/by-course/${selectedCourseId}/invoices-amounts`, { params: { year, month } }),
      ]);
      const custs: CustomerRow[] = (customersRes.data || []).map((r: any) => ({
        id: r.id,
        custom_id: r.custom_id,
        customer_name: r.customer_name,
        delivery_order: r.delivery_order,
      }));
      setCustomers(custs);
      setAmounts((amountsRes.data?.items || []) as AmountItem[]);
    } catch (e: any) {
      console.error('請求書発行対象の取得に失敗', e);
      setError(e?.response?.data?.error || '請求書発行対象の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const amountMap = useMemo(() => {
    const m = new Map<number, AmountItem>();
    amounts.forEach(a => m.set(a.customer_id, a));
    return m;
  }, [amounts]);

  const handlePreview = (customerId: number) => {
    navigate(`/invoice-preview/${customerId}?year=${year}&month=${month}`);
  };

  const handleBatchPreview = () => {
    if (!selectedCourseId) {
      setError('コースを選択してください');
      return;
    }
    navigate(`/invoice-preview/batch?courseId=${selectedCourseId}&year=${year}&month=${month}`);
  };

  const monthLabel = (() => {
    try {
      const d = new Date(`${outputMonth}-01T00:00:00`);
      const m = d.getMonth() + 1;
      return `${m}月分`;
    } catch {
      return '対象月未設定';
    }
  })();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        請求書発行
      </Typography>

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              対象選択
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel id="course-select-label">コース</InputLabel>
                <Select
                  labelId="course-select-label"
                  label="コース"
                  value={selectedCourseId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedCourseId(v === '' ? null : Number(v));
                  }}
                >
                  {courses.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {(c.custom_id ? `${c.custom_id} ` : '') + c.course_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="対象月"
                type="month"
                value={outputMonth}
                onChange={(e) => setOutputMonth(e.target.value)}
                size="small"
              />
              <Typography variant="body1">{monthLabel}</Typography>
              <Button variant="contained" onClick={handleLoadList} disabled={loading}>
                一覧読み込み
              </Button>
              <Button variant="contained" color="secondary" onClick={handleBatchPreview} disabled={!selectedCourseId}>
                請求書発行（2アップ一括）
              </Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              発行対象一覧
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              コースと対象月を選択し「一覧読み込み」を押してください。各顧客の行から請求書プレビューに移動できます。
            </Typography>
            <Divider sx={{ my: 1 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>配達順</TableCell>
                  <TableCell>顧客ID</TableCell>
                  <TableCell>顧客名</TableCell>
                  <TableCell align="right">請求額</TableCell>
                  <TableCell>確定</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((c) => {
                  const a = amountMap.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{typeof c.delivery_order === 'number' ? c.delivery_order : ''}</TableCell>
                      <TableCell>{pad7(c.custom_id)}</TableCell>
                      <TableCell>{c.customer_name}</TableCell>
                      <TableCell align="right">{typeof a?.amount === 'number' ? a.amount.toLocaleString() : '-'}</TableCell>
                      <TableCell>{a?.confirmed ? '確定済' : '未確定'}</TableCell>
                      <TableCell>
                        <Button variant="outlined" size="small" onClick={() => handlePreview(c.id)} disabled={!a}>
                          請求書プレビュー
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {customers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">対象一覧は未取得です</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default InvoiceIssuance;