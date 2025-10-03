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
} from '@mui/material';
import axios from 'axios';
// 日本語入力の拡張（ローマ字変換）は撤去し、標準のTextFieldに戻します

interface Customer {
  id?: number;
  custom_id?: string;
  customer_name: string;
  yomi?: string;
  address: string;
  phone: string;
  email?: string;
  course_id: number;
  contract_start_date: string;
  notes?: string;
}

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
  customer?: Customer | null;
  isEdit?: boolean;
}

const CustomerForm: React.FC<CustomerFormProps> = ({
  open,
  onClose,
  onSave,
  customer,
  isEdit = false,
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
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

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
            const res = await axios.get('/api/customers/next-id');
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
      const response = await axios.get('/api/masters/courses');
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
    if (formData.yomi && /[^\u3040-\u309F\s・ー]/.test(formData.yomi)) {
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
        await axios.put(`/api/customers/${customer.id}`, formData);
      } else {
        await axios.post('/api/customers', formData);
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
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="顧客ID"
                value={formData.custom_id || ''}
                onChange={(e) => setFormData({ ...formData, custom_id: e.target.value })}
                placeholder="空白の場合は自動生成されます"
                helperText="4桁の数字（例: 0001）"
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
    </Dialog>
  );
};

export default CustomerForm;