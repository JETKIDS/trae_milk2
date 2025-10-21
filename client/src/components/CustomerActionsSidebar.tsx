import React from 'react';
import { Box, Card, CardContent, Typography, Button, Divider, Chip, Stack, Checkbox, FormControlLabel, Popover, TextField, Menu, MenuItem, Snackbar, Alert } from '@mui/material';
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
  // 口座情報の表示用（任意）
  bankCode?: string;
  branchCode?: string;
  accountType?: number | null;
  accountNumber?: string;
  accountHolderKatakana?: string;
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
  // 表示用口座情報
  bankCode,
  branchCode,
  accountType,
  accountNumber,
  accountHolderKatakana,
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

  // 集金方法プルダウン（メニュー）
  const [methodMenuAnchor, setMethodMenuAnchor] = React.useState<HTMLElement | null>(null);
  const methodMenuOpen = Boolean(methodMenuAnchor);
  const handleOpenMethodMenu = (e: React.MouseEvent<HTMLElement>) => setMethodMenuAnchor(e.currentTarget);
  const handleCloseMethodMenu = () => setMethodMenuAnchor(null);
  const [draftMethod, setDraftMethod] = React.useState<'collection' | 'debit' | null>(null);
  const effectiveMethod: 'collection' | 'debit' = draftMethod || billingMethod || 'collection';
  const currentMethodLabel = (effectiveMethod === 'debit') ? '引き落し' : '集金';
  const [savingMethod, setSavingMethod] = React.useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = React.useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = React.useState<string>('');
  const [snackbarSeverity, setSnackbarSeverity] = React.useState<'success' | 'error'>('success');

const handleSelectMethod = (next: 'collection' | 'debit') => {
  handleCloseMethodMenu();
  // 選択はドラフトとして保持し、保存までは反映しない
  if (next === billingMethod) {
    setDraftMethod(null);
    return;
  }
  setDraftMethod(next);
};

const saveMethodChange = async () => {
  if (!draftMethod || draftMethod === billingMethod) { setDraftMethod(null); return; }
  const oldLabel = (billingMethod === 'debit') ? '引き落し' : '集金';
  const newLabel = (draftMethod === 'debit') ? '引き落し' : '集金';
  const ok = window.confirm(`請求方法を「${oldLabel}」から「${newLabel}」へ変更します。保存しますか？`);
  if (!ok) return;
  try {
    setSavingMethod(true);
    await Promise.resolve(onChangeBillingMethod?.(draftMethod));
    setSnackbarMsg('請求方法を保存しました');
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
    setDraftMethod(null);
  } catch (e) {
    console.error(e);
    setSnackbarMsg('請求方法の保存に失敗しました');
    setSnackbarSeverity('error');
    setSnackbarOpen(true);
  } finally {
    setSavingMethod(false);
  }
};

  // 口座情報が登録済みかの判定（厳しめの基準で判定）
  const hasBankInfo = Boolean(
    (bankCode && bankCode.trim().length === 4) ||
    (branchCode && branchCode.trim().length === 3) ||
    (accountNumber && accountNumber.trim().length === 7) ||
    (typeof accountType === 'number' && (accountType === 1 || accountType === 2)) ||
    (accountHolderKatakana && accountHolderKatakana.trim().length > 0)
  );

  const renderBillingMethodSelector = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">請求方法</Typography>
      <Button variant="outlined" size="small" onClick={handleOpenMethodMenu}>
        {currentMethodLabel}（変更）
      </Button>
      <Menu anchorEl={methodMenuAnchor} open={methodMenuOpen} onClose={handleCloseMethodMenu}>
        <MenuItem onClick={() => handleSelectMethod('collection')}>集金</MenuItem>
        <MenuItem onClick={() => handleSelectMethod('debit')}>引き落し</MenuItem>
      </Menu>
      {draftMethod && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label="未保存" color="warning" size="small" />
          <Button size="small" variant="contained" onClick={saveMethodChange} disabled={savingMethod}>保存</Button>
          <Button size="small" onClick={() => setDraftMethod(null)} disabled={savingMethod}>キャンセル</Button>
        </Box>
      )}
      {effectiveMethod === 'debit' && (
        <Box sx={{ ml: 1 }}>
          <Typography variant="caption" color="text.secondary">
            引き落しを利用する場合は口座情報の登録・確認が必要です。
            {onOpenBankInfo && (
              <Button size="small" sx={{ ml: 1 }} onClick={onOpenBankInfo}>口座登録・修正</Button>
            )}
          </Typography>
          {/* 登録済み口座情報の表示 */}
          <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">登録口座情報</Typography>
            {hasBankInfo ? (
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                <Typography variant="body2">金融機関コード: {bankCode || '-'}</Typography>
                <Typography variant="body2">支店コード: {branchCode || '-'}</Typography>
                <Typography variant="body2">預金種別: {accountType === 1 ? '普通' : accountType === 2 ? '当座' : '-'}</Typography>
                <Typography variant="body2">口座番号: {accountNumber || '-'}</Typography>
                <Typography variant="body2">口座名義: {accountHolderKatakana || '-'}</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">未登録です。口座情報を登録してください。</Typography>
            )}
          </Box>
        </Box>
      )}
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
          <Divider sx={{ my: 2 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>前月請求・入金</Typography>
            {/* 入金モードの切替 */}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Chip label={entryMode === 'auto' ? '請求額に対する自動入金' : '手動入金'} size="small" variant="outlined" />
              <Button size="small" variant="text" onClick={() => setEntryMode(entryMode === 'auto' ? 'manual' : 'auto')}>
                {entryMode === 'auto' ? '手動に切替' : '自動に戻す'}
              </Button>
            </Stack>
            {/* 自動入金時の金額 */}
            {entryMode === 'auto' ? (
              <Typography variant="body2" sx={{ mt: 1 }}>前月請求額: ¥{autoDisplayAmount.toLocaleString()} / 入金額入力不要</Typography>
            ) : (
              <Box sx={{ mt: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">入金額</Typography>
                  <TextField
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 1 }}
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <Typography variant="body2">円</Typography>
                  <Button variant="contained" size="small" disabled={!canSave} onClick={() => onSavePrevPayment && onSavePrevPayment(Number(manualAmount), 'manual', payYear, payMonth)}>
                    登録
                  </Button>
                </Stack>
                {/* 前月年月の選択 */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <TextField label="年" size="small" type="number" value={payYear} onChange={(e) => setPayYear(Number(e.target.value))} />
                  <TextField label="月" size="small" type="number" value={payMonth} onChange={(e) => setPayMonth(Number(e.target.value))} />
                </Stack>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* 入金登録カード */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>入金登録</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" startIcon={<MonetizationOnIcon />} onClick={handleOpen}>
              入金を登録
            </Button>
            <Button variant="text" onClick={onOpenPaymentHistory}>入金履歴</Button>
            <Button variant="outlined" color="error" onClick={onUnconfirmInvoice}>月次請求確定取消</Button>
          </Stack>

          {/* 入金登録のポップオーバー */}
          <Popover open={open} anchorEl={anchorEl} onClose={handleClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
            <Box sx={{ p: 2, minWidth: 320 }}>
              <Typography variant="subtitle2">入金登録</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {prevMonth ? `${prevYear}年${prevMonth}月の入金を登録します。` : '入金対象の月を選択してください。'}
              </Typography>
              {/* 自動/手動 切替 */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <FormControlLabel control={<Checkbox checked={entryMode === 'manual'} onChange={(e) => setEntryMode(e.target.checked ? 'manual' : 'auto')} />} label="手動入力" />
                <FormControlLabel control={<Checkbox checked={entryMode === 'auto'} onChange={(e) => setEntryMode(e.target.checked ? 'auto' : 'manual')} />} label="請求額に対する自動入金" />
              </Stack>

              {/* 自動時の表示 */}
              {entryMode === 'auto' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">自動入金額</Typography>
                  <Chip label={`¥${autoDisplayAmount.toLocaleString()}`} color="primary" size="small" />
                </Box>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField size="small" type="number" inputProps={{ min: 0, step: 1 }} value={manualAmount} onChange={(e) => setManualAmount(e.target.value === '' ? '' : Number(e.target.value))} />
                  <Typography variant="body2">円</Typography>
                </Stack>
              )}

              {/* 年月の入力 */}
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <TextField label="年" size="small" type="number" value={payYear} onChange={(e) => setPayYear(Number(e.target.value))} />
                <TextField label="月" size="small" type="number" value={payMonth} onChange={(e) => setPayMonth(Number(e.target.value))} />
              </Stack>

              {/* 登録ボタン */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                <Button onClick={handleClose}>閉じる</Button>
                <Button variant="contained" disabled={!canSave} onClick={() => onSavePrevPayment && onSavePrevPayment(Number(entryMode === 'auto' ? autoDisplayAmount : manualAmount), entryMode, payYear, payMonth)}>登録</Button>
              </Box>
            </Box>
          </Popover>
        </CardContent>
      </Card>

      {/* 完了通知 */}
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)}>
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CustomerActionsSidebar;