import React from 'react';
import { Box, Card, CardContent, Typography, Button, Divider, Chip, Stack, Checkbox, FormControlLabel, ToggleButtonGroup, ToggleButton } from '@mui/material';
import {
  Edit as EditIcon,
  MonetizationOn as MonetizationOnIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material';

interface Props {
  // 概要表示用（任意）
  customerName?: string;
  customId?: string;
  courseName?: string;
  monthlyTotal?: number;
  billingRoundingEnabled?: boolean; // 端数処理のON/OFF
  onToggleBillingRounding?: (checked: boolean) => void;
  billingMethod?: 'collection' | 'debit';
  onChangeBillingMethod?: (method: 'collection' | 'debit') => void;
  onOpenEditForm?: () => void;
  onOpenUnitPriceChange?: () => void;
  onOpenBankInfo?: () => void; // 口座情報
  // onOpenBillingRounding?: () => void; // （UI移動により非使用）
}

const CustomerActionsSidebar: React.FC<Props> = ({
  customerName,
  customId,
  courseName,
  monthlyTotal,
  billingRoundingEnabled,
  onToggleBillingRounding,
  billingMethod,
  onChangeBillingMethod,
  onOpenEditForm,
  onOpenUnitPriceChange,
  onOpenBankInfo,
  // onOpenBillingRounding,
}) => {
  const renderBillingMethodSelector = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">請求方法</Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={billingMethod || 'collection'}
        onChange={(_, value) => value && onChangeBillingMethod && onChangeBillingMethod(value)}
      >
        <ToggleButton value="collection">集金</ToggleButton>
        <ToggleButton value="debit">引き落し</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );

  return (
    <Box sx={{ position: 'sticky', top: 16 }}>
      {/* 概要カード */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
            顧客概要
          </Typography>
          {customerName ? (
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body1" fontWeight={600}>{customerName}</Typography>
                {renderBillingMethodSelector()}
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                {customId && <Chip label={`ID: ${customId}`} size="small" variant="outlined" />}
                {courseName && <Chip label={`コース: ${courseName}`} size="small" color="primary" />}
              </Stack>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">顧客情報は読み込み中です</Typography>
          )}
          {typeof monthlyTotal === 'number' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">今月概算合計</Typography>
              <Typography variant="h6" color="primary">
                ¥{monthlyTotal.toLocaleString()}
              </Typography>
              {/* 端数処理のチェックボックス */}
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">端数処理</Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={!!billingRoundingEnabled}
                      onChange={(e) => onToggleBillingRounding && onToggleBillingRounding(e.target.checked)}
                      size="small"
                    />
                  }
                  label="1の位切り捨て"
                />
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            操作メニュー
          </Typography>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            startIcon={<EditIcon />}
            sx={{ mb: 1 }}
            onClick={onOpenEditForm}
          >
            顧客情報を編集
          </Button>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
            商品・配達に関する変更
          </Typography>

          <Button
            variant="outlined"
            fullWidth
            startIcon={<MonetizationOnIcon />}
            sx={{ mb: 1 }}
            onClick={onOpenUnitPriceChange}
          >
            単価変更
          </Button>

          {/* 口座情報（引き落し選択時のみ表示） */}
          {billingMethod === 'debit' && (
            <Button
              variant="outlined"
              fullWidth
              sx={{ mb: 1 }}
              onClick={onOpenBankInfo}
            >
              口座情報
            </Button>
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary">
            ヒント: 操作は保存後にすぐ左側のカレンダーと月次集計へ反映されます。
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CustomerActionsSidebar;