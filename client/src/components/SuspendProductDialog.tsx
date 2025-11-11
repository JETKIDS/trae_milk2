import React, { useEffect, useState } from 'react';
import { Dialog, Box, Typography, Button, TextField, Alert } from '@mui/material';

interface SuspendProductDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceConfirmed?: boolean;
  productName?: string;
  defaultStartDate?: string; // YYYY-MM-DD
  defaultEndDate?: string; // YYYY-MM-DD or ''
  onSave?: (startDate: string, endDate?: string) => Promise<void> | void;
}

const SuspendProductDialog: React.FC<SuspendProductDialogProps> = ({ open, onClose, invoiceConfirmed = false, productName, defaultStartDate, defaultEndDate, onSave }) => {
  const [startDate, setStartDate] = useState<string>(defaultStartDate || '');
  const [endDate, setEndDate] = useState<string>(defaultEndDate || '');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setStartDate(defaultStartDate || '');
    setEndDate(defaultEndDate || '');
    setError('');
  }, [defaultStartDate, defaultEndDate, open]);

  const validate = (): string => {
    if (!startDate) return '開始日を入力してください';
    if (endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (e < s) return '終了日は開始日以降を指定してください';
    }
    return '';
  };

  const handleSave = async () => {
    if (invoiceConfirmed) return;
    const err = validate();
    setError(err);
    if (err) return;
    if (onSave) await onSave(startDate, endDate || undefined);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          商品の休止（期間指定）
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {productName ? `${productName}` : ''}
        </Typography>
        {invoiceConfirmed && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            この月は確定済みのため編集できません。
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="開始日"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            disabled={invoiceConfirmed}
          />
          <TextField
            label="終了日（空=開始日のみ）"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            disabled={invoiceConfirmed}
            helperText={error || ''}
            error={!!error}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={onClose}>閉じる</Button>
          <Button variant="contained" onClick={handleSave} disabled={invoiceConfirmed}>
            保存
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default SuspendProductDialog;