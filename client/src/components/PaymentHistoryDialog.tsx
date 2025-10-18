import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Typography,
  IconButton,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { PaymentRecord, PaymentMethod } from '../types/ledger';

interface Props {
  customerId: number;
  open: boolean;
  onClose: () => void;
  defaultYear: number;
  defaultMonth: number;
  onUpdated?: () => void | Promise<void>;
}

const PaymentHistoryDialog: React.FC<Props> = ({ customerId, open, onClose, defaultYear, defaultMonth, onUpdated }) => {
  const [year, setYear] = useState<number>(defaultYear);
  const [month, setMonth] = useState<number>(defaultMonth);
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const [q, setQ] = useState<string>('');
  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState<string>('');

  useEffect(() => {
    if (open) {
      setYear(defaultYear);
      setMonth(defaultMonth);
      setMethod('');
      setQ('');
    }
  }, [open, defaultYear, defaultMonth]);

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/customers/${customerId}/payments`, {
          params: { year, month, method: method || undefined, q: q || undefined },
        });
        setRows(res.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [open, customerId, year, month, method, q]);

  const handleStartEdit = (r: PaymentRecord) => {
    setEditingId(r.id);
    setEditingNote(r.note || '');
  };

  const handleSaveNote = async (id: number) => {
    try {
      await axios.patch(`/api/customers/${customerId}/payments/${id}`, { note: editingNote });
      // refresh
      const res = await axios.get(`/api/customers/${customerId}/payments`, { params: { year, month, method: method || undefined, q: q || undefined } });
      setRows(res.data || []);
      setEditingId(null);
      setEditingNote('');
      if (onUpdated) await onUpdated();
    } catch (e) {
      console.error(e);
      alert('メモの保存に失敗しました');
    }
  };

  const handleCancelPayment = async (id: number) => {
    if (!window.confirm('この入金を取消（マイナス入金）します。よろしいですか？')) return;
    try {
      await axios.post(`/api/customers/${customerId}/payments/${id}/cancel`);
      // refresh
      const res = await axios.get(`/api/customers/${customerId}/payments`, { params: { year, month, method: method || undefined, q: q || undefined } });
      setRows(res.data || []);
      if (onUpdated) await onUpdated();
    } catch (e) {
      console.error(e);
      alert('取消に失敗しました');
    }
  };

  const amountFmt = (n: number) => new Intl.NumberFormat('ja-JP').format(n);

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>入金履歴</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField label="年" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value || '0', 10) || defaultYear)} size="small" />
          <TextField label="月" select value={month} onChange={(e) => setMonth(parseInt(e.target.value || '0', 10) || defaultMonth)} size="small" sx={{ minWidth: 100 }}>
            {monthOptions.map((m) => (
              <MenuItem key={m} value={m}>{m}</MenuItem>
            ))}
          </TextField>
          <TextField label="方法" select value={method} onChange={(e) => setMethod((e.target.value as any) || '')} size="small" sx={{ minWidth: 160 }}>
            <MenuItem value="">すべて</MenuItem>
            <MenuItem value="collection">現金集金</MenuItem>
            <MenuItem value="debit">口座振替</MenuItem>
          </TextField>
          <TextField label="メモ検索" value={q} onChange={(e) => setQ(e.target.value)} size="small" sx={{ flex: 1 }} />
        </Stack>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>作成日時</TableCell>
              <TableCell>年月</TableCell>
              <TableCell align="right">金額</TableCell>
              <TableCell>方法</TableCell>
              <TableCell>メモ</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '-'}</TableCell>
                <TableCell>{r.year}/{String(r.month).padStart(2, '0')}</TableCell>
                <TableCell align="right">{amountFmt(r.amount)}</TableCell>
                <TableCell>
                  <Chip label={r.method === 'collection' ? '現金集金' : '口座振替'} size="small" />
                </TableCell>
                <TableCell>
                  {editingId === r.id ? (
                    <TextField value={editingNote} onChange={(e) => setEditingNote(e.target.value)} size="small" fullWidth />
                  ) : (
                    <Typography variant="body2" color="text.secondary">{r.note || ''}</Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {editingId === r.id ? (
                    <Stack direction="row" justifyContent="center" spacing={1}>
                      <IconButton size="small" color="primary" onClick={() => handleSaveNote(r.id)}><SaveIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => { setEditingId(null); setEditingNote(''); }}><CancelIcon fontSize="small" /></IconButton>
                    </Stack>
                  ) : (
                    <Stack direction="row" justifyContent="center" spacing={1}>
                      <IconButton size="small" onClick={() => handleStartEdit(r)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => handleCancelPayment(r.id)}><CancelIcon fontSize="small" /></IconButton>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">{loading ? '読み込み中...' : '対象データがありません'}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentHistoryDialog;