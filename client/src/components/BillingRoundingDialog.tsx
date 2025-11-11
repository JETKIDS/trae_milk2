import React from 'react';
import { Dialog, Box, Typography, Button } from '@mui/material';

interface BillingRoundingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}

const BillingRoundingDialog: React.FC<BillingRoundingDialogProps> = ({ open, onClose, onSave }) => {
  const handleSave = () => {
    if (onSave) onSave();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          端数処理の設定
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          当月請求の端数処理を選択してください（例：1の位切り捨て）。
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={onClose}>閉じる</Button>
          <Button variant="contained" onClick={handleSave} disabled>
            保存（未実装）
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default BillingRoundingDialog;