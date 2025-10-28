import React from 'react';
import { Box, Card, CardContent, Typography, Button, Divider, Chip, Stack, TextField, Menu, MenuItem } from '@mui/material';

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
  const [manualAmount, setManualAmount] = React.useState<number | ''>('');

  // 集金方法プルダウン（メニュー）
  const [methodMenuAnchor, setMethodMenuAnchor] = React.useState<HTMLElement | null>(null);
  const methodMenuOpen = Boolean(methodMenuAnchor);
  const handleOpenMethodMenu = (e: React.MouseEvent<HTMLElement>) => setMethodMenuAnchor(e.currentTarget);
  const handleCloseMethodMenu = () => setMethodMenuAnchor(null);
  const [draftMethod, setDraftMethod] = React.useState<'collection' | 'debit' | null>(null);
  const effectiveMethod: 'collection' | 'debit' = draftMethod || billingMethod || 'collection';
  const currentMethodLabel = (effectiveMethod === 'debit') ? '引き落し' : '集金';
  const [savingMethod, setSavingMethod] = React.useState<boolean>(false);
  

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
    setDraftMethod(null);
  } catch (e) {
    console.error(e);
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

  const autoFillAmount = prevInvoiceAmount || 0;
  const isNextMonth = (() => {
    if (!currentYear || !currentMonth || !prevYear || !prevMonth) return false;
    const sameYearNext = prevYear === currentYear && prevMonth + 1 === currentMonth;
    const yearTurn = prevYear + 1 === currentYear && prevMonth === 12 && currentMonth === 1;
    return sameYearNext || yearTurn;
  })();
  const canShowPrevInvoice = Boolean(prevMonthConfirmed && isNextMonth);
  // 保存対象は「前月（確定月）」に紐づくため、prevYear/prevMonth が必須
  const canSave = !!manualAmount && Number(manualAmount) > 0 && canShowPrevInvoice && !!prevYear && !!prevMonth;

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
          {/* 前月請求額＋当月入金 */}
          <Divider sx={{ my: 2 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>前月請求・当月入金</Typography>
            {canShowPrevInvoice ? (
              <>
                <Typography variant="body2" sx={{ mt: 1 }}>前月請求額（{prevYear}年{prevMonth}月）: ¥{(prevInvoiceAmount || 0).toLocaleString()}</Typography>
                <Box sx={{ mt: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">当月入金額（{currentYear}年{currentMonth}月）</Typography>
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 1 }}
                      value={manualAmount}
                      onChange={e => setManualAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <Button size="small" variant="outlined" onClick={() => setManualAmount(autoFillAmount)}>自動</Button>
                  </Stack>
                  <Box sx={{ mt: 1 }}>
                    <Button size="small" variant="contained" disabled={!canSave} onClick={() => onSavePrevPayment?.(Number(manualAmount), 'manual', Number(prevYear), Number(prevMonth))}>入金保存</Button>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  差し引き金額: ¥{(((prevInvoiceAmount || 0) - (prevPaymentAmount || 0)) || 0).toLocaleString()}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                前月の請求が未確定、または当月が翌月ではないため表示できません。
              </Typography>
            )}
          </Box>
          {/* 月次確定・取消 */}
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="primary" onClick={onConfirmInvoice}>月次請求確定</Button>
            <Button variant="outlined" color="secondary" onClick={onUnconfirmInvoice}>取消</Button>
          </Stack>
          {/* 履歴・編集 */}
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onOpenPaymentHistory}>入金履歴</Button>
            <Button variant="outlined" onClick={onOpenUnitPriceChange}>単価変更</Button>
            <Button variant="outlined" onClick={onOpenEditForm}>顧客編集</Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CustomerActionsSidebar;