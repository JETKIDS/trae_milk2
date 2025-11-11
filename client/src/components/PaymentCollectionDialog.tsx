import React from 'react';
import { Dialog, Box, Typography, TextField, Button } from '@mui/material';

interface PaymentCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceConfirmed: boolean;
  paymentAmount: number | '';
  paymentNote: string;
  paymentSaving: boolean;
  onPaymentAmountChange: (value: number | '') => void;
  onPaymentNoteChange: (value: string) => void;
  onSave: () => void;
}

const PaymentCollectionDialog: React.FC<PaymentCollectionDialogProps> = ({
  open,
  onClose,
  invoiceConfirmed,
  paymentAmount,
  paymentNote,
  paymentSaving,
  onPaymentAmountChange,
  onPaymentNoteChange,
  onSave,
}) => {
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onPaymentAmountChange(value === '' ? '' : Number(value));
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPaymentNoteChange(e.target.value);
  };

  const canSave = !invoiceConfirmed || paymentSaving || paymentAmount === '' || Number(paymentAmount) <= 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>入金登録（集金）</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          当月の集金金額を入力して登録します。
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="金額"
            type="text"
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
            value={paymentAmount}
            onChange={handleAmountChange}
            fullWidth
            autoFocus
          />
          <TextField
            label="メモ（任意）"
            value={paymentNote}
            onChange={handleNoteChange}
            fullWidth
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button onClick={onClose} disabled={paymentSaving}>キャンセル</Button>
          <Button variant="contained" onClick={onSave} disabled={canSave}>
            {paymentSaving ? '保存中…' : '保存'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default PaymentCollectionDialog;