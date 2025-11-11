import React, { useEffect, useState } from 'react';
import { Dialog, Box, Typography, Button, TextField, Alert } from '@mui/material';

interface CancelProductDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceConfirmed?: boolean;
  productName?: string;
  defaultEffectiveDate?: string; // YYYY-MM-DD（この日以降を解約）
  onConfirm?: (effectiveDate: string) => Promise<void> | void;
}

const CancelProductDialog: React.FC<CancelProductDialogProps> = ({ open, onClose, invoiceConfirmed = false, productName, defaultEffectiveDate, onConfirm }) => {
  const [effectiveDate, setEffectiveDate] = useState<string>(defaultEffectiveDate || '');

  useEffect(() => {
    setEffectiveDate(defaultEffectiveDate || '');
  }, [defaultEffectiveDate, open]);

  const handleConfirm = async () => {
    if (invoiceConfirmed) return;
    if (!effectiveDate) return;
    if (onConfirm) await onConfirm(effectiveDate);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          商品の中止（契約終了）
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {productName ? `${productName}` : ''}
        </Typography>
        {invoiceConfirmed && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            この月は確定済みのため編集できません。
          </Alert>
        )}
        <TextField
          label="適用日（この日以降を解約）"
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
          disabled={invoiceConfirmed}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={onClose}>閉じる</Button>
          <Button variant="contained" color="error" onClick={handleConfirm} disabled={invoiceConfirmed || !effectiveDate}>
            中止を確定
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default CancelProductDialog;