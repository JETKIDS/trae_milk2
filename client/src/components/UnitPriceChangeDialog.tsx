import React from 'react';
import { Dialog, Box, Typography, FormControl, InputLabel, Select, MenuItem, TextField, Button } from '@mui/material';
import { DeliveryPattern } from '../types/customerDetail';

interface UnitPriceChangeDialogProps {
  open: boolean;
  onClose: () => void;
  patterns: DeliveryPattern[];
  unitPriceChangeTargetId: number | '';
  onChangeTargetId: (value: number | '') => void;
  unitPriceChangeNewPrice: number | '';
  onChangeNewPrice: (value: number | '') => void;
  unitPriceChangeStartMonth: string;
  onChangeStartMonth: (value: string) => void;
  unitPriceChangeSaving: boolean;
  onSave: () => void;
}

const UnitPriceChangeDialog: React.FC<UnitPriceChangeDialogProps> = ({
  open,
  onClose,
  patterns,
  unitPriceChangeTargetId,
  onChangeTargetId,
  unitPriceChangeNewPrice,
  onChangeNewPrice,
  unitPriceChangeStartMonth,
  onChangeStartMonth,
  unitPriceChangeSaving,
  onSave,
}) => {
  const handleTargetChange = (e: React.ChangeEvent<{ value: unknown }>) => {
    const v = e.target.value as unknown;
    const num = typeof v === 'number' ? v : Number(v as string);
    onChangeTargetId(Number.isNaN(num) ? '' : num);
  };

  const handleNewPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChangeNewPrice(v === '' ? '' : Number(v));
  };

  const handleStartMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeStartMonth(e.target.value);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>単価変更</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel id="unit-price-change-product-label">対象商品</InputLabel>
            <Select
              labelId="unit-price-change-product-label"
              label="対象商品"
              value={unitPriceChangeTargetId}
              onChange={handleTargetChange as any}
            >
              {patterns.filter(p => p.is_active).map((p) => (
                <MenuItem key={p.id} value={p.id!}>
                  {p.product_name}（{p.manufacturer_name}） / 現在単価: ¥{p.unit_price.toLocaleString()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="変更後単価"
            type="number"
            inputProps={{ step: 1 }}
            value={unitPriceChangeNewPrice}
            onChange={handleNewPriceChange}
            fullWidth
            error={false}
            helperText=""
          />

          <TextField
            label="変更開始月"
            type="month"
            value={unitPriceChangeStartMonth}
            onChange={handleStartMonthChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="この月の1日から新しい単価を適用します"
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button onClick={onClose}>閉じる</Button>
          <Button
            variant="contained"
            disabled={unitPriceChangeSaving || unitPriceChangeTargetId === '' || unitPriceChangeNewPrice === '' || !unitPriceChangeStartMonth}
            onClick={onSave}
          >
            {unitPriceChangeSaving ? '保存中...' : '保存'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default UnitPriceChangeDialog;