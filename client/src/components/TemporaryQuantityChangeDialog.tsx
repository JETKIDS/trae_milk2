import React, { useEffect, useState } from 'react';
import { Dialog, Box, Typography, Button, TextField, Alert } from '@mui/material';

interface TemporaryQuantityChangeDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceConfirmed?: boolean;
  productName?: string;
  date?: string; // YYYY-MM-DD
  defaultQuantity?: number;
  onSave?: (quantity: number) => Promise<void> | void;
}

const TemporaryQuantityChangeDialog: React.FC<TemporaryQuantityChangeDialogProps> = ({
  open,
  onClose,
  invoiceConfirmed = false,
  productName,
  date,
  defaultQuantity,
  onSave,
}) => {
  const [quantity, setQuantity] = useState<string | number>(defaultQuantity ?? '');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setQuantity(defaultQuantity ?? '');
    setError('');
  }, [defaultQuantity, open]);

  const validate = (val: string | number): string => {
    if (val === '') return '本数を入力してください';
    const num = Number(val);
    if (!Number.isFinite(num) || Number.isNaN(num)) return '数値を入力してください';
    if (!Number.isInteger(num)) return '整数で入力してください';
    if (num < 0) return '0以上の値を入力してください';
    return '';
  };

  const handleSave = async () => {
    if (invoiceConfirmed) return;
    const err = validate(quantity);
    setError(err);
    if (err) return;
    if (onSave) await onSave(Number(quantity));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          一時的な数量変更（当日）
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {(productName && date) ? `${productName} / ${date}` : ''}
        </Typography>
        {invoiceConfirmed && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            この月は確定済みのため変更できません。
          </Alert>
        )}
        <TextField
          label="本数"
          type="number"
          inputProps={{ min: 0, step: 1 }}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
          fullWidth
          autoFocus
          disabled={invoiceConfirmed}
          error={!!error}
          helperText={error || '当日の本数を整数で入力してください'}
        />
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

export default TemporaryQuantityChangeDialog;