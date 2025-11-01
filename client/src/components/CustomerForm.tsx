import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  Snackbar,
  Alert,
  Menu,
  Card,
} from '@mui/material';
import apiClient from '../utils/apiClient';
import { pad7 } from '../utils/id';
import { hiraganaRegex } from '../utils/validation';
import { Customer } from '../types/customer';
// 日本語入力の拡張（ローマ字変換）は撤去し、標準のTextFieldに戻します

// 顧客タイプは共通定義を使用します

 interface Course {
   id: number;
   course_name: string;
   description?: string;
 }

// スタッフ連携は廃止

interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  isEdit?: boolean;
  customer?: Customer | null;
  onOpenBankInfo?: () => void; // 引き落し時の関連情報リンク
}

const CustomerForm: React.FC<CustomerFormProps> = ({
  open,
  onClose,
  onSave,
  customer,
  isEdit = false,
  onOpenBankInfo,
}) => {
  const [formData, setFormData] = useState<Customer>({
    customer_name: '',
    yomi: '',
    address: '',
    phone: '',
    email: '',
    course_id: 0,
    contract_start_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 請求方法（編集フォーム内でも統一のプルダウン＋確認フロー）
  const [billingMethod, setBillingMethod] = useState<'collection'|'debit'>(customer?.billing_method === 'debit' ? 'debit' : 'collection');
  const [draftBillingMethod, setDraftBillingMethod] = useState<'collection'|'debit'|null>(null);
  const [bmMenuAnchor, setBmMenuAnchor] = useState<HTMLElement|null>(null);
  const [savingBilling, setSavingBilling] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success'|'error'|'info'>('success');

  const openBmMenu = (e: React.MouseEvent<HTMLButtonElement>) => setBmMenuAnchor(e.currentTarget);
  const closeBmMenu = () => setBmMenuAnchor(null);
  const selectBillingMethod = (method: 'collection'|'debit') => {
    setDraftBillingMethod(method);
    closeBmMenu();
  };

  const saveBillingMethodChange = async () => {
    if (!customer?.id || !draftBillingMethod) return;
    const currentLabel = billingMethod === 'debit' ? '引き落し' : '集金';
    const newLabel = draftBillingMethod === 'debit' ? '引き落し' : '集金';
    const ok = window.confirm(`請求方法を「${currentLabel}」から「${newLabel}」に変更して保存します。よろしいですか？`);
    if (!ok) return;
    setSavingBilling(true);
    try {
      // 現在の端数設定を取得して維持
      let roundingEnabled = 1;
      try {
        const res = await apiClient.get(`/api/customers/${customer.id}`);
        roundingEnabled = typeof res.data?.settings?.rounding_enabled === 'number'
          ? res.data.settings.rounding_enabled
          : (res.data?.settings?.rounding_enabled ? 1 : 0);
      } catch (e) {
        // 取得失敗時は1で保存（丸め有り）
        console.warn('端数設定の取得に失敗しました。1として保存します。', e);
      }
      await apiClient.put(`/api/customers/${customer.id}/settings`, {
        billing_method: draftBillingMethod,
        rounding_enabled: roundingEnabled,
      });
      setBillingMethod(draftBillingMethod);
      setDraftBillingMethod(null);
      setSnackbarSeverity('success');
      setSnackbarMsg('請求方法を保存しました');
      setSnackbarOpen(true);
    } catch (e) {
      console.error('請求方法の保存に失敗しました', e);
      setSnackbarSeverity('error');
      setSnackbarMsg('請求方法の保存に失敗しました');
      setSnackbarOpen(true);
    } finally {
      setSavingBilling(false);
    }
  };

  const cancelBillingMethodDraft = () => setDraftBillingMethod(null);


  useEffect(() => {
    if (open) {
      fetchCourses();
      if (customer && isEdit) {
        setFormData({
          ...customer,
          course_id: customer.course_id || 0,
        });
      } else {
        setFormData({
          customer_name: '',
          yomi: '',
          address: '',
          phone: '',
          email: '',
          course_id: 0,
          contract_start_date: new Date().toISOString().split('T')[0],
          notes: '',
        });
        // 新規登録のときは未使用の最小4桁IDを取得して表示
        (async () => {
          try {
            const res = await apiClient.get('/api/customers/next-id');
            if (res.data?.custom_id) {
              setFormData(prev => ({ ...prev, custom_id: res.data.custom_id }));
            }
          } catch (e) {
            console.warn('次の顧客IDの取得に失敗しました:', e);
          }
        })();
      }
      setErrors({});
    }
  }, [open, customer, isEdit]);

  const fetchCourses = async () => {
    try {
      const response = await apiClient.get('/api/masters/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('コース情報の取得に失敗しました:', error);
    }
  };

  // スタッフ取得は不要

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.customer_name.trim()) {
      newErrors.customer_name = '顧客名は必須です';
    }

    // よみがなは任意だが、入力されている場合はひらがなのみを推奨
    if (formData.yomi && !hiraganaRegex.test(formData.yomi)) {
      newErrors.yomi = 'よみがなはひらがなで入力してください';
    }

    if (!formData.address.trim()) {
      newErrors.address = '住所は必須です';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = '電話番号は必須です';
    }

    if (!formData.course_id || formData.course_id === 0) {
      newErrors.course_id = 'コースの選択は必須です';
    }

    if (!formData.contract_start_date) {
      newErrors.contract_start_date = '契約開始日は必須です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      if (isEdit && customer?.id) {
        await apiClient.put(`/api/customers/${customer.id}`, formData);
      } else {
        await apiClient.post('/api/customers', formData);
      }
      onSave();
      onClose();
    } catch (error: any) {
      console.error('顧客情報の保存に失敗しました:', error);
      if (error.response?.data?.error) {
        setErrors({ submit: error.response.data.error });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCourseChange = (courseId: number) => {
    setFormData({ ...formData, course_id: courseId });
  };
  

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEdit ? '顧客情報編集' : '新規顧客登録'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={3}>
            {/* 請求方法（プルダウン＋確認フロー） */}
            {isEdit && (
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>請求方法</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={billingMethod === 'debit' ? '引き落し' : '集金'} color={billingMethod === 'debit' ? 'primary' : 'default'} />
                    <Button size="small" variant="text" onClick={openBmMenu}>変更</Button>
                    <Menu anchorEl={bmMenuAnchor} open={!!bmMenuAnchor} onClose={closeBmMenu}>
                      <MenuItem onClick={() => selectBillingMethod('collection')}>集金</MenuItem>
                      <MenuItem onClick={() => selectBillingMethod('debit')}>引き落し</MenuItem>
                    </Menu>

                    {draftBillingMethod && (
                      <>
                        <Chip label="未保存" color="warning" variant="outlined" />
                        <Button size="small" variant="contained" onClick={saveBillingMethodChange} disabled={savingBilling}>保存</Button>
                        <Button size="small" onClick={cancelBillingMethodDraft}>キャンセル</Button>
                      </>
                    )}
                  </Box>
                  {(draftBillingMethod ?? billingMethod) === 'debit' && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      引き落し設定の際は口座情報の登録が必要です。{onOpenBankInfo ? (<Button size="small" onClick={onOpenBankInfo}>口座登録・修正</Button>) : null}
                    </Typography>
                  )}
                </Card>
              </Grid>
            )}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="顧客ID（7桁）"
                value={formData.custom_id ? pad7(formData.custom_id) : ''}
                InputProps={{ readOnly: true }}
                helperText="最小未使用の7桁IDが自動設定されます（編集不可）"
              />
            </Grid>
            <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            required
            label="顧客名"
            value={formData.customer_name}
            onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            error={!!errors.customer_name}
            helperText={errors.customer_name}
          />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="よみがな（ひらがな）"
              value={formData.yomi || ''}
              onChange={(e) => setFormData({ ...formData, yomi: e.target.value })}
              error={!!errors.yomi}
              helperText={errors.yomi || '例：たなかたろう'}
            />
          </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="住所"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                error={!!errors.address}
                helperText={errors.address}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                required
                label="電話番号"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                error={!!errors.phone}
                helperText={errors.phone}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="メールアドレス"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required error={!!errors.course_id}>
                <InputLabel>配達コース</InputLabel>
                <Select
                  value={formData.course_id || ''}
                  onChange={(e) => handleCourseChange(Number(e.target.value))}
                  label="配達コース"
                >
                  <MenuItem value={0} disabled>
                    コースを選択してください
                  </MenuItem>
                  {courses.map((course) => (
                    <MenuItem key={course.id} value={course.id}>
                      {course.course_name}
                      {course.description && ` (${course.description})`}
                    </MenuItem>
                  ))}
                </Select>
                {errors.course_id && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {errors.course_id}
                  </Typography>
                )}
              </FormControl>
            </Grid>
            {/* 担当スタッフ欄は廃止 */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                required
                label="契約開始日"
                type="date"
                value={formData.contract_start_date}
                onChange={(e) => setFormData({ ...formData, contract_start_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                error={!!errors.contract_start_date}
                helperText={errors.contract_start_date}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="備考"
                multiline
                rows={3}
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
          {errors.submit && (
            <Typography color="error" sx={{ mt: 2 }}>
              {errors.submit}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
        >
          {loading ? '保存中...' : (isEdit ? '更新' : '登録')}
        </Button>
      </DialogActions>
     {/* 保存完了/失敗の通知 */}
     <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
       <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
         {snackbarMsg}
       </Alert>
     </Snackbar>
    </Dialog>
  );
};

export default CustomerForm;