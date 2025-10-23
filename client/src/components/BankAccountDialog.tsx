import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, Box, Typography, TextField, Button, FormControl, InputLabel, Select, MenuItem, Stack, Alert } from '@mui/material';
import axios from 'axios';
import { halfKanaRegex, isBankCode4, isBranchCode3, isAccountNumber7 } from '../utils/validation';

interface BankValues {
  bank_code: string;
  branch_code: string;
  account_type: number | null; // 1: 普通, 2: 当座
  account_number: string;
  account_holder_katakana: string;
}

interface Props {
  customerId: number;
  open: boolean;
  onClose: () => void;
  initialValues: BankValues;
  onSaved?: (updated?: BankValues) => void;
  // 現在の集金方法と端数処理を渡しておく（INSERT時に既存値を保持するため）
  currentBillingMethod?: 'collection' | 'debit';
  currentRoundingEnabled?: boolean;
}

const BankAccountDialog: React.FC<Props> = ({ customerId, open, onClose, initialValues, onSaved, currentBillingMethod, currentRoundingEnabled }) => {
  const [vals, setVals] = useState<BankValues>(initialValues);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');

  useEffect(() => {
    setVals(initialValues);
    setError('');
    setInfo('');
  }, [initialValues, open]);

  // 追加: ダイアログを開いたときにサーバから最新の口座情報を取得してプリフィルを強化
  useEffect(() => {
    if (!open || !customerId) return;
    (async () => {
      try {
        const res = await axios.get(`/api/customers/${customerId}`);
        const s = res.data?.settings || null;
        if (!s) return;
        setVals(prev => ({
          bank_code: s?.bank_code ?? prev.bank_code ?? '',
          branch_code: s?.branch_code ?? prev.branch_code ?? '',
          account_type: (typeof s?.account_type === 'number')
            ? s.account_type
            : (typeof s?.account_type === 'string' && s.account_type !== '' ? Number(s.account_type) : prev.account_type ?? null),
          account_number: s?.account_number ?? prev.account_number ?? '',
          account_holder_katakana: s?.account_holder_katakana ?? prev.account_holder_katakana ?? '',
        }));
      } catch (e) {
        // プリフィル用の読込失敗はUI上のエラー表示は省略（必要なら親でリトライ）
        console.warn('口座情報のプリフィル取得に失敗しました:', e);
      }
    })();
  }, [open, customerId]);

  const onChange = (key: keyof BankValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value || '';
    if (key === 'bank_code') {
      v = v.replace(/[^0-9]/g, '').slice(0, 4);
    } else if (key === 'branch_code') {
      v = v.replace(/[^0-9]/g, '').slice(0, 3);
    } else if (key === 'account_number') {
      v = v.replace(/[^0-9]/g, '').slice(0, 7);
    }
    // account_holder_katakana は入力値をそのまま保持（自動半角変換なし）
    setVals(prev => ({ ...prev, [key]: v }));
  };

  const onChangeType = (e: any) => {
    const raw = e.target.value;
    const num = raw === '' ? null : Number(raw);
    setVals(prev => ({ ...prev, account_type: (num === 1 || num === 2) ? num : null }));
  };

  // 自動変換機能は廃止のため、convertHolderToHalfは削除

  const valid = useMemo(() => {
    if (!isBankCode4(vals.bank_code || '')) return false;
    if (!isBranchCode3(vals.branch_code || '')) return false;
    if (!(vals.account_type === 1 || vals.account_type === 2)) return false;
    if (!isAccountNumber7(vals.account_number || '')) return false;
    const name = vals.account_holder_katakana || '';
    return name.length > 0 && halfKanaRegex.test(name);
  }, [vals]);

  const save = async () => {
    setError('');
    setInfo('');
    // 自動半角化は行わず、入力された半角データのみ許容
    const inputName = vals.account_holder_katakana || '';
    if (!inputName || !halfKanaRegex.test(inputName)) {
      setError('口座名義は半角カタカナで入力してください（スペース可・全角不可）');
      return;
    }
    try {
      setSaving(true);
      const payload: any = {
        bank_code: vals.bank_code || null,
        branch_code: vals.branch_code || null,
        account_type: vals.account_type ?? null,
        account_number: vals.account_number || null,
        account_holder_katakana: inputName,
        // 既存の請求設定も送信してレコードの初回作成時に値を保持する
        billing_method: currentBillingMethod,
        rounding_enabled: typeof currentRoundingEnabled === 'boolean' ? (currentRoundingEnabled ? 1 : 0) : undefined,
      };
      const res = await axios.put(`/api/customers/${customerId}/settings`, payload);
      setSaving(false);
      setInfo('口座情報を保存しました');
      if (onSaved) onSaved(res.data);
    } catch (e: any) {
      console.error(e);
      setSaving(false);
      setError(e?.response?.data?.error || '保存に失敗しました');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>口座情報</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          金融機関コード、支店コード、預金種別、口座番号、口座名義（半角カタカナ）を入力してください。
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="金融機関コード（4桁）"
            value={vals.bank_code || ''}
            onChange={onChange('bank_code')}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }}
            fullWidth
          />
          <TextField
            label="支店コード（3桁）"
            value={vals.branch_code || ''}
            onChange={onChange('branch_code')}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 3 }}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel shrink>預金種別</InputLabel>
            <Select
              value={vals.account_type ?? ''}
              onChange={onChangeType}
              displayEmpty
            >
              <MenuItem value="">未選択</MenuItem>
              <MenuItem value={1}>1: 普通預金</MenuItem>
              <MenuItem value={2}>2: 当座預金</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="口座番号（7桁）"
            value={vals.account_number || ''}
            onChange={onChange('account_number')}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 7 }}
            fullWidth
          />
          <TextField
            label="口座名義（半角カタカナ）"
            value={vals.account_holder_katakana || ''}
            onChange={onChange('account_holder_katakana')}
            inputProps={{ maxLength: 30 }}
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          {info && <Alert severity="success">{info}</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={onClose}>閉じる</Button>
            <Button variant="contained" onClick={save} disabled={!valid || saving}>保存</Button>
          </Box>
        </Stack>
      </Box>
    </Dialog>
  );
};

export default BankAccountDialog;