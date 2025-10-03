import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  DragIndicator as DragIndicatorIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import axios from 'axios';

interface Course {
  id: number;
  custom_id: string;
  course_name: string;
  description?: string;
}

interface Customer {
  id: number;
  custom_id: string;
  customer_name: string;
  address: string;
  phone: string;
  course_id: number;
  delivery_order: number;
  course_name: string;
  staff_name: string;
  contract_start_date: string;
}

interface Staff {
  id: number;
  staff_name: string;
  phone?: string;
  email?: string;
  course_id?: number | null;
  course_name?: string | null;
  all_course_names?: string | null;
}

const CourseManagement: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // 新規コース追加モーダル用状態
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newCourseCustomId, setNewCourseCustomId] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('');
  const [newCourseDescription, setNewCourseDescription] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [staffOptions, setStaffOptions] = useState<Staff[]>([]);

  // コース一覧を取得
  const fetchCourses = async () => {
    try {
      const response = await axios.get('/api/masters/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('コース一覧の取得に失敗しました:', error);
      setSnackbar({ open: true, message: 'コース一覧の取得に失敗しました', severity: 'error' });
    }
  };

  // 選択されたコースの顧客一覧を取得
  const fetchCustomersByCourse = async (courseId: number) => {
    try {
      console.log('顧客データ取得開始 - コースID:', courseId);
      const response = await axios.get(`/api/customers/by-course/${courseId}`);
      console.log('取得した顧客データ:', response.data);
      
      // delivery_orderでソート（既にサーバーサイドでソートされているが念のため）
      const sortedCustomers = response.data.sort((a: Customer, b: Customer) => a.delivery_order - b.delivery_order);
      console.log('ソート後の顧客データ:', sortedCustomers);
      setCustomers(sortedCustomers);
    } catch (error) {
      console.error('顧客一覧の取得に失敗しました:', error);
      setSnackbar({ open: true, message: '顧客一覧の取得に失敗しました', severity: 'error' });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchCourses();
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchCustomersByCourse(selectedCourse.id);
    }
  }, [selectedCourse]);

  // コース選択
  const handleCourseSelect = (course: Course) => {
    setSelectedCourse(course);
  };

  // 3桁ID生成：現在登録済みのID以外で最小の数値（001〜999）
  const generateThreeDigitId = (): string => {
    const used = new Set(
      courses
        .map(c => c.custom_id)
        .filter((id): id is string => typeof id === 'string' && /^\d{3}$/.test(id))
    );
    for (let n = 1; n <= 999; n++) {
      const candidate = n.toString().padStart(3, '0');
      if (!used.has(candidate)) return candidate;
    }
    // 万一すべて使用済みの場合は安全側で '999' を返す
    return '999';
  };

  const openNewCourseDialog = () => {
    setNewCourseCustomId(generateThreeDigitId());
    setNewCourseName('');
    setSelectedStaffId('');
    setNewCourseDescription('');
    setNewDialogOpen(true);
    // 担当者一覧の取得
    fetchStaffOptions();
  };

  const closeNewCourseDialog = () => {
    if (creatingCourse) return;
    setNewDialogOpen(false);
  };

  const fetchStaffOptions = async () => {
    try {
      const res = await axios.get('/api/masters/staff');
      setStaffOptions(res.data);
    } catch (err) {
      console.error('スタッフ一覧の取得に失敗しました:', err);
      setSnackbar({ open: true, message: 'スタッフ一覧の取得に失敗しました', severity: 'error' });
    }
  };

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) {
      setSnackbar({ open: true, message: 'コース名を入力してください', severity: 'error' });
      return;
    }
    setCreatingCourse(true);
    try {
      const payload = {
        custom_id: newCourseCustomId,
        course_name: newCourseName.trim(),
        description: newCourseDescription.trim() || undefined,
      };
      const res = await axios.post('/api/masters/courses', payload);

      // 既存スタッフの割り当て（選択されている場合）
      const createdCourseId = res.data?.id;
      try {
        await axios.post(`/api/masters/courses/${createdCourseId}/staff-assign`, { staff_id: selectedStaffId ? Number(selectedStaffId) : null });
      } catch (e) {
        console.error('担当者割り当てに失敗:', e);
        setSnackbar({ open: true, message: 'コースは作成しましたが、担当者の割り当てに失敗しました', severity: 'error' });
      }

      await fetchCourses();
      const newC: Course = {
        id: res.data?.id,
        custom_id: res.data?.custom_id || newCourseCustomId,
        course_name: newCourseName.trim(),
        description: newCourseDescription.trim() || undefined,
      };
      setSelectedCourse(newC);
      setSnackbar({ open: true, message: '新規コースを作成しました', severity: 'success' });
      setNewDialogOpen(false);
    } catch (err: any) {
      console.error('コース作成に失敗:', err);
      const msg = err?.response?.data?.error || 'コース作成に失敗しました';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setCreatingCourse(false);
    }
  };

  // ドラッグ&ドロップ処理
  const handleDragEnd = (result: DropResult) => {
    console.log('ドラッグ&ドロップ結果:', result);
    
    if (!result.destination) {
      console.log('ドロップ先が無効です');
      return;
    }

    const items = Array.from(customers);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // delivery_orderを更新
    const updatedCustomers = items.map((customer, index) => ({
      ...customer,
      delivery_order: index + 1,
    }));

    console.log('更新された顧客リスト:', updatedCustomers);
    setCustomers(updatedCustomers);
  };

  // 配達順の保存
  const handleSaveOrder = async () => {
    if (!selectedCourse) {
      console.log('コースが選択されていません');
      return;
    }

    console.log('配達順保存開始:', selectedCourse);
    setSaving(true);
    try {
      // 一括更新用のデータを準備
      const updates = customers.map((customer) => ({
        id: customer.id,
        delivery_order: customer.delivery_order,
      }));

      console.log('保存するデータ:', updates);

      // 一括更新APIを使用
      const response = await axios.put('/api/customers/delivery-order/bulk', { updates });
      console.log('保存レスポンス:', response.data);
      
      setSnackbar({ open: true, message: '配達順が正常に保存されました', severity: 'success' });
    } catch (error) {
      console.error('配達順の保存に失敗しました:', error);
      setSnackbar({ open: true, message: '配達順の保存に失敗しました', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // スナックバーを閉じる
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>読み込み中...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        コース管理
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNewCourseDialog}>
          新規コース追加
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* コース一覧 */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                配達コース一覧
              </Typography>
              <List>
                {courses.map((course) => (
                  <ListItem
                    key={course.id}
                    button
                    selected={selectedCourse?.id === course.id}
                    onClick={() => handleCourseSelect(course)}
                    sx={{
                      border: selectedCourse?.id === course.id ? '2px solid #1976d2' : '1px solid #e0e0e0',
                      borderRadius: 1,
                      mb: 1,
                    }}
                  >
                    <ListItemText
                      primary={course.course_name}
                      secondary={course.description}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* 顧客一覧（ドラッグ&ドロップ対応） */}
        <Grid item xs={12} md={8}>
          {selectedCourse ? (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    {selectedCourse.course_name} - 顧客配達順
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveOrder}
                    disabled={saving}
                  >
                    {saving ? '保存中...' : '配達順を保存'}
                  </Button>
                </Box>

                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  ドラッグ&ドロップで配達順を変更できます
                </Typography>

                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="customer-list">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef}>
                        {customers.map((customer, index) => (
                          <Draggable
                            key={`customer-${customer.id}`}
                            draggableId={`customer-${customer.id}`}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Paper
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                sx={{
                                  p: 2,
                                  mb: 1,
                                  backgroundColor: snapshot.isDragging ? '#f5f5f5' : 'white',
                                  border: snapshot.isDragging ? '2px solid #1976d2' : '1px solid #e0e0e0',
                                  cursor: 'grab',
                                  '&:hover': {
                                    backgroundColor: '#f9f9f9',
                                  },
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Box {...provided.dragHandleProps} sx={{ mr: 2 }}>
                                    <DragIndicatorIcon color="action" />
                                  </Box>
                                  <Chip
                                    label={customer.delivery_order}
                                    size="small"
                                    color="primary"
                                    sx={{ mr: 2, minWidth: 40 }}
                                  />
                                  <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                      {customer.customer_name}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                      {customer.address}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                      ID: {customer.custom_id} | TEL: {customer.phone}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Paper>
                            )}
                          </Draggable>
                        ))}
                        {customers.length === 0 && (
                          <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body1" color="textSecondary">
                              このコースには顧客が登録されていません
                            </Typography>
                          </Box>
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="h6" color="textSecondary">
                    コースを選択してください
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                    左側のコース一覧から管理したいコースを選択してください
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}
      </Grid>
    </Grid>

    {/* 新規コース追加モーダル */}
    <Dialog open={newDialogOpen} onClose={closeNewCourseDialog} fullWidth maxWidth="sm">
      <DialogTitle>新規コースの作成</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="コースID (3桁)"
              value={newCourseCustomId}
              onChange={(e) => setNewCourseCustomId(e.target.value.replace(/\D/g, '').slice(0, 3))}
              helperText="未使用の最小3桁IDを自動生成。必要に応じて編集可"
              fullWidth
              inputProps={{ maxLength: 3 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="コース名"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              required
              fullWidth
            />
          </Grid>
      <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel id="staff-select-label">担当者</InputLabel>
              <Select
                labelId="staff-select-label"
                label="担当者"
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value as number | '')}
              >
                <MenuItem value="">選択しない</MenuItem>
                {staffOptions.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.staff_name}{(s.all_course_names || s.course_name) ? `（${s.all_course_names || s.course_name}）` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="説明"
              value={newCourseDescription}
              onChange={(e) => setNewCourseDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeNewCourseDialog} startIcon={<CancelIcon />} disabled={creatingCourse}>キャンセル</Button>
        <Button onClick={handleCreateCourse} variant="contained" startIcon={<SaveIcon />} disabled={creatingCourse}>
          {creatingCourse ? '作成中...' : '作成する'}
        </Button>
      </DialogActions>
    </Dialog>

      {/* スナックバー */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CourseManagement;