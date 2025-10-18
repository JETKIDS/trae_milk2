import React from 'react';
import { Box, Card, CardContent, Typography, Button, Divider, Chip, Stack, Checkbox, FormControlLabel, ToggleButtonGroup, ToggleButton, Popover, TextField } from '@mui/material';
import {
  Edit as EditIcon,
  MonetizationOn as MonetizationOnIcon,
} from '@mui/icons-material';
import { pad7 } from '../utils/id';

interface Props {
  // 概要表示用（任意）
  customerName?: string;
  customId?: string;
  courseName?: string;
  monthlyTotal?: number;
  // 表示月の確定ステータス
  invoiceConfirmed?: boolean;
  onConfirmInvoice?: () => Promise<void> | void;
  currentYear?: number;
  currentMonth?: number;
  // 追記: 確定日時の表示
  invoiceConfirmedAt?: string;
  // 前月サマリ
  prevInvoiceAmount?: number;
  prevPaymentAmount?: number;
  prevYear?: number;
  prevMonth?: number;
  onSavePrevPayment?: (amount: number, mode: 'auto' | 'manual', year: number, month: number) => Promise<void>;
  billingRoundingEnabled?: boolean; // 端数処理のON/OFF
  onToggleBillingRounding?: (checked: boolean) => void;
  billingMethod?: 'collection' | 'debit';
  onChangeBillingMethod?: (method: 'collection' | 'debit') => void;
  onOpenEditForm?: () => void;
  onOpenUnitPriceChange?: () => void;
  onOpenBankInfo?: () => void; // 口座情報
  // 追記: 入金履歴ダイアログを開く
  onOpenPaymentHistory?: () => void;
  // 追記: 月次確定取消
  onUnconfirmInvoice?: () => void;
  // 追記: 前月の請求確定有無（入金処理ガード用）
  prevMonthConfirmed?: boolean;
  // onOpenBillingRounding?: () => void; // （UI移動により非使用）
}

const CustomerActionsSidebar: React.FC<Props> = ({
  customerName,
  customId,
  courseName,
  monthlyTotal,
  invoiceConfirmed,
  onConfirmInvoice,
  currentYear,
  currentMonth,
  // 追加: 確定日時
  invoiceConfirmedAt,
  prevInvoiceAmount,
  prevPaymentAmount,
  prevYear,
  prevMonth,
  onSavePrevPayment,
  billingRoundingEnabled,
  onToggleBillingRounding,
  billingMethod,
  onChangeBillingMethod,
  onOpenEditForm,
  onOpenUnitPriceChange,
  onOpenBankInfo,
  // 追加: 入金履歴ダイアログ
  onOpenPaymentHistory,
  // 追加: 月次確定取消
  onUnconfirmInvoice,
  // 追加: 前月確定フラグ
  prevMonthConfirmed,
  // onOpenBillingRounding,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [entryMode, setEntryMode] = React.useState<'auto' | 'manual'>('auto');
  const [manualAmount, setManualAmount] = React.useState<number | ''>('');
  // 入金月（デフォルト：前月）
  const now = new Date();
  const defaultYear = prevYear || now.getFullYear();
  const defaultMonth = prevMonth || (now.getMonth() === 0 ? 12 : now.getMonth()); // prevMonth が未提供時の簡易デフォルト
  const [payYear, setPayYear] = React.useState<number>(defaultYear);
  const [payMonth, setPayMonth] = React.useState<number>(defaultMonth);
  const open = Boolean(anchorEl);
  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    // 前月未確定なら警告して開かない
    if (prevMonthConfirmed === false) {
      alert('前月の請求が未確定のため、入金処理はできません。先に「月次請求確定」を実行してください。');
      return;
    }
    // ポップオーバーを開くたびにデフォルト（前月）に初期化
    setPayYear(prevYear || defaultYear);
    setPayMonth(prevMonth || defaultMonth);
    setAnchorEl(e.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);

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

  const diffCarryover = (prevInvoiceAmount || 0) - (prevPaymentAmount || 0);
  const autoDisplayAmount = prevInvoiceAmount || 0;
  const canSave = entryMode === 'auto' ? autoDisplayAmount > 0 : !!manualAmount && Number(manualAmount) > 0;

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
              {/* 顧客名は1行固定（折り返し回避）、集金方法は1段下に表示 */}
              <Box>
                <Typography variant="body1" fontWeight={600} noWrap>{customerName}</Typography>
              </Box>
              <Box sx={{ mt: 1 }}>
                {renderBillingMethodSelector()}
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                {customId !== undefined && <Chip label={`ID: ${pad7(customId)}`} size="small" variant="outlined" />}
                {courseName && <Chip label={`コース: ${courseName}`} size="small" color="primary" />}
              </Stack>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">顧客情報は読み込み中です</Typography>
          )}
          {/* 前月請求額＋入金処理 */}
          {typeof prevInvoiceAmount === 'number' && typeof prevPaymentAmount === 'number' && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">前月請求額（{prevYear}/{prevMonth}）</Typography>
              <Typography variant="h6">¥{(prevInvoiceAmount || 0).toLocaleString()}</Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">入金額</Typography>
                <Typography variant="body1">¥{(prevPaymentAmount || 0).toLocaleString()}</Typography>
              </Box>
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">繰越額（差分）</Typography>
                <Typography variant="body1">¥{diffCarryover.toLocaleString()}</Typography>
              </Box>
              <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={handleOpen} sx={{ opacity: prevMonthConfirmed === false ? 0.5 : 1 }}>入金処理</Button>
                {prevMonthConfirmed === false && (
                  <Typography variant="caption" color="warning.main" sx={{ ml: 1 }}>
                    前月が未確定のため入金処理はできません
                  </Typography>
                )}
              </Box>
              <Popover open={open} anchorEl={anchorEl} onClose={handleClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Box sx={{ p: 2, maxWidth: 300 }}>
                  <Typography variant="subtitle2" gutterBottom>前月分 入金登録</Typography>
                  <ToggleButtonGroup size="small" exclusive value={entryMode} onChange={(_, v) => v && setEntryMode(v)} sx={{ mb: 1 }}>
                    <ToggleButton value="auto">自動（前月請求額）</ToggleButton>
                    <ToggleButton value="manual">手動</ToggleButton>
                  </ToggleButtonGroup>
                  {/* 入金月の指定（デフォルトは前月） */}
                  <TextField
                    label="入金月"
                    type="month"
                    value={`${payYear}-${String(payMonth).padStart(2, '0')}`}
                    onChange={(e) => {
                      const val = e.target.value; // YYYY-MM
                      const [yStr, mStr] = val.split('-');
                      const y = Number(yStr);
                      const m = Number(mStr);
                      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
                        setPayYear(y);
                        setPayMonth(m);
                      }
                    }}
                    fullWidth
                    sx={{ mb: 1 }}
                    helperText="デフォルトは前月。必要に応じて変更してください。"
                  />
                  {entryMode === 'auto' ? (
                    <TextField label="入金額" value={autoDisplayAmount.toLocaleString()} InputProps={{ readOnly: true }} fullWidth />
                  ) : (
                    <TextField label="入金額" type="number" value={manualAmount} onChange={(e) => setManualAmount(e.target.value === '' ? '' : Number(e.target.value))} fullWidth autoFocus />
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                    <Button onClick={handleClose}>キャンセル</Button>
                    <Button
                      color="error"
                      onClick={async () => {
                        // 処理取り消し：選択中の入金月に対して、現在の前月入金額を打ち消す（負の入金）を登録
                        if (!onSavePrevPayment) return;
                        const cancelTarget = prevPaymentAmount || 0;
                        if (cancelTarget <= 0) { handleClose(); return; }
                        // 取り消しは手動扱い、金額は負値で登録
                        await onSavePrevPayment(-cancelTarget, 'manual', payYear, payMonth);
                        handleClose();
                      }}
                      disabled={(prevPaymentAmount || 0) <= 0}
                    >処理を取り消す</Button>
                    <Button variant="contained" disabled={!canSave} onClick={async () => {
                      const amt = entryMode === 'auto' ? autoDisplayAmount : Number(manualAmount);
                      if (!amt || amt <= 0) return;
                      if (onSavePrevPayment) {
                        await onSavePrevPayment(amt, entryMode, payYear, payMonth);
                      }
                      handleClose();
                    }}>保存</Button>
                  </Box>
                </Box>
              </Popover>
            </Box>
          )}
          {typeof monthlyTotal === 'number' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">今月概算合計</Typography>
              <Typography variant="h6" color="primary">
                ¥{monthlyTotal.toLocaleString()}
              </Typography>
              {/* 月次確定ステータス */}
              <Box sx={{ mt: 1 }}>
                {invoiceConfirmed ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Chip label={`${currentYear}/${currentMonth} は確定済み`} size="small" color="success" variant="outlined" />
                    {invoiceConfirmedAt && (
                      <Typography variant="caption" color="text.secondary">確定日時: {new Date(invoiceConfirmedAt).toLocaleString('ja-JP')}</Typography>
                    )}
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button size="small" variant="outlined" color="error" onClick={onUnconfirmInvoice}>確定取消</Button>
                      <Button size="small" variant="outlined" onClick={onOpenPaymentHistory}>入金履歴</Button>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="caption" color="warning.main">未確定：パターン変更で金額が変動する可能性があります</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button size="small" variant="outlined" onClick={onConfirmInvoice}>月次確定</Button>
                      <Button size="small" variant="outlined" onClick={onOpenPaymentHistory}>入金履歴</Button>
                    </Box>
                  </Box>
                )}
              </Box>
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

          {/* 入金履歴ボタンは月次セクションへ移動しました（視認性向上のため） */}

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