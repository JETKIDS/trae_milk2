import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Paper,
  TextField,
  InputAdornment,
  Grid,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { 
  Add as AddIcon,
  Search as SearchIcon,
  DragIndicator as DragIndicatorIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import apiClient from '../utils/apiClient';
// import moment from 'moment';
// import { pad7 } from '../utils/id';

interface Course {
  id: number;
  custom_id?: string;
  course_name: string;
  description: string;
}

interface Customer {
  id: number;
  custom_id: string;
  customer_name: string;
  address: string;
  phone: string;
  course_id: number;
  delivery_order: number;
}

interface SortableCustomerProps {
  customer: Customer;
  index: number;
}

const SortableCustomer: React.FC<SortableCustomerProps> = ({ customer, index }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: customer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      sx={{
        mb: 1,
        p: 2,
        cursor: 'grab',
        border: isDragging ? '2px dashed #1976d2' : '1px solid #e0e0e0',
        '&:hover': {
          backgroundColor: '#f9f9f9',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <DragIndicatorIcon 
          sx={{ color: '#666', cursor: 'grab' }} 
          {...attributes} 
          {...listeners}
        />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight="bold">
            {customer.customer_name}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {customer.address}
          </Typography>
        </Box>
        <Chip
          label={`順序: ${customer.delivery_order || index + 1}`}
          size="small"
          color="primary"
          variant="outlined"
        />
      </Box>
    </Paper>
  );
};

const CourseList: React.FC = () => {
  // タブ管理
  const [tabValue, setTabValue] = useState(0);
  
  // コース管理
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');
  
  // 顧客管理
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  
  // ドラッグ&ドロップ
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // ダイアログ管理
  const [newCourseDialog, setNewCourseDialog] = useState(false);
  const [editCourseDialog, setEditCourseDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  
  // フォーム管理
  const [courseForm, setCourseForm] = useState({
    custom_id: '',
    course_name: '',
    description: ''
  });
  
  // 通知管理
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'warning' | 'info'
  });

  // コース一覧取得
  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('コース一覧取得エラー:', error);
      setSnackbar({
        open: true,
        message: 'コース一覧の取得に失敗しました',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // 顧客一覧取得
  const fetchCustomers = useCallback(async (courseId: number) => {
    try {
      setLoadingCustomers(true);
      const response = await apiClient.get(`/api/customers/by-course/${courseId}`);
      setCustomers(response.data);
    } catch (error) {
      console.error('顧客一覧取得エラー:', error);
      setSnackbar({
        open: true,
        message: '顧客一覧の取得に失敗しました',
        severity: 'error'
      });
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  // 初期化
  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // コース選択時の処理
  useEffect(() => {
    if (selectedCourseId) {
      fetchCustomers(selectedCourseId as number);
    } else {
      setCustomers([]);
    }
  }, [selectedCourseId, fetchCustomers]);

  // 検索フィルタリング
  const filteredCourses = courses.filter(course => {
    const matchesId = !searchId || course.custom_id?.includes(searchId);
    const matchesName = !searchName || course.course_name.includes(searchName);
    return matchesId && matchesName;
  });

  // ドラッグ&ドロップ処理
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }

    setCustomers((items) => {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      
      // 配達順序を更新
      return newItems.map((customer, index) => ({
        ...customer,
        delivery_order: index + 1,
      }));
    });
  }, []);

  // 順序保存
  const handleSaveOrder = async () => {
    if (!selectedCourseId) return;

    try {
      await apiClient.put(`/api/customers/update-delivery-order`, {
        courseId: selectedCourseId,
        customers: customers.map((customer, index) => ({
          id: customer.id,
          delivery_order: index + 1
        }))
      });

      setSnackbar({
        open: true,
        message: '配達順序を保存しました',
        severity: 'success'
      });
    } catch (error) {
      console.error('順序保存エラー:', error);
      setSnackbar({
        open: true,
        message: '配達順序の保存に失敗しました',
        severity: 'error'
      });
    }
  };

  // 新規コース作成
  const handleCreateCourse = async () => {
    try {
      await apiClient.post('/api/courses', courseForm);
      setNewCourseDialog(false);
      setCourseForm({ custom_id: '', course_name: '', description: '' });
      fetchCourses();
      setSnackbar({
        open: true,
        message: 'コースを作成しました',
        severity: 'success'
      });
    } catch (error) {
      console.error('コース作成エラー:', error);
      setSnackbar({
        open: true,
        message: 'コースの作成に失敗しました',
        severity: 'error'
      });
    }
  };

  // コース編集
  const handleEditCourse = async () => {
    if (!selectedCourse) return;

    try {
      await apiClient.put(`/api/courses/${selectedCourse.id}`, courseForm);
      setEditCourseDialog(false);
      setCourseForm({ custom_id: '', course_name: '', description: '' });
      setSelectedCourse(null);
      fetchCourses();
      setSnackbar({
        open: true,
        message: 'コースを更新しました',
        severity: 'success'
      });
    } catch (error) {
      console.error('コース更新エラー:', error);
      setSnackbar({
        open: true,
        message: 'コースの更新に失敗しました',
        severity: 'error'
      });
    }
  };

  // コース削除
  const handleDeleteCourse = async () => {
    if (!selectedCourse) return;

    try {
      await apiClient.delete(`/api/courses/${selectedCourse.id}`);
      setDeleteDialog(false);
      setSelectedCourse(null);
      fetchCourses();
      setSnackbar({
        open: true,
        message: 'コースを削除しました',
        severity: 'success'
      });
    } catch (error) {
      console.error('コース削除エラー:', error);
      setSnackbar({
        open: true,
        message: 'コースの削除に失敗しました',
        severity: 'error'
      });
    }
  };

  // ダイアログ開く
  const openNewCourseDialog = () => {
    setCourseForm({ custom_id: '', course_name: '', description: '' });
    setNewCourseDialog(true);
  };

  const openEditCourseDialog = (course: Course) => {
    setSelectedCourse(course);
    setCourseForm({
      custom_id: course.custom_id || '',
      course_name: course.course_name,
      description: course.description
    });
    setEditCourseDialog(true);
  };

  const openDeleteDialog = (course: Course) => {
    setSelectedCourse(course);
    setDeleteDialog(true);
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        コース管理
      </Typography>

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label="コース一覧" />
        <Tab label="配達順序管理" />
      </Tabs>

      {/* コース一覧タブ */}
      {tabValue === 0 && (
        <Box>
          {/* 検索フィルター */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="コースID"
                placeholder="コースIDで検索"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="コース名"
                placeholder="コース名で検索"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />
            </Grid>
          </Grid>

          {/* 新規追加ボタン */}
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openNewCourseDialog}
            >
              新規追加
            </Button>
          </Box>

          {/* コース一覧テーブル */}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>コースID</TableCell>
                  <TableCell>コース名</TableCell>
                  <TableCell>説明</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCourses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography color="textSecondary">
                        {searchId || searchName ? '検索条件に一致するコースが見つかりません' : 'コースが登録されていません'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCourses.map((course) => (
                    <TableRow key={course.id} hover>
                      <TableCell>
                        <Chip 
                          label={course.custom_id || '未設定'} 
                          color="primary" 
                          variant="outlined" 
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body1" fontWeight="bold">
                          {course.course_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="textSecondary">
                          {course.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => openEditCourseDialog(course)}
                        >
                          編集
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => openDeleteDialog(course)}
                          sx={{ ml: 1 }}
                        >
                          削除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* 配達順序管理タブ */}
      {tabValue === 1 && (
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>配達コース</InputLabel>
                <Select
                  value={selectedCourseId}
                  label="配達コース"
                  onChange={(e) => setSelectedCourseId(e.target.value as number | '')}
                >
                  <MenuItem value="">
                    <em>コースを選択してください</em>
                  </MenuItem>
                  {courses.map((course) => (
                    <MenuItem key={course.id} value={course.id}>
                      {course.course_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveOrder}
                disabled={!selectedCourseId || customers.length === 0}
                fullWidth
              >
                配達順序を保存
              </Button>
            </Grid>
          </Grid>

          {/* 顧客リスト */}
          {selectedCourseId && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  顧客一覧（ドラッグ&ドロップで順序変更可能）
                </Typography>
                
                {loadingCustomers ? (
                  <Typography>読み込み中...</Typography>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={customers.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <Box sx={{ minHeight: '200px' }}>
                        {customers.map((customer, index) => (
                          <SortableCustomer
                            key={customer.id}
                            customer={customer}
                            index={index}
                          />
                        ))}
                        {customers.length === 0 && (
                          <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body1" color="textSecondary">
                              このコースに顧客が登録されていません
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* 新規コースダイアログ */}
      <Dialog open={newCourseDialog} onClose={() => setNewCourseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新規コース作成</DialogTitle>
        <DialogContent>
          <TextField
            label="コースID"
            value={courseForm.custom_id}
            onChange={(e) => setCourseForm({ ...courseForm, custom_id: e.target.value })}
            fullWidth
            sx={{ mb: 2 }}
            helperText="空欄の場合は自動で割り当てられます"
          />
          <TextField
            label="コース名"
            value={courseForm.course_name}
            onChange={(e) => setCourseForm({ ...courseForm, course_name: e.target.value })}
            fullWidth
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="説明"
            value={courseForm.description}
            onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewCourseDialog(false)}>キャンセル</Button>
          <Button onClick={handleCreateCourse} variant="contained">作成</Button>
        </DialogActions>
      </Dialog>

      {/* 編集コースダイアログ */}
      <Dialog open={editCourseDialog} onClose={() => setEditCourseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>コース編集</DialogTitle>
        <DialogContent>
          <TextField
            label="コースID"
            value={courseForm.custom_id}
            onChange={(e) => setCourseForm({ ...courseForm, custom_id: e.target.value })}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="コース名"
            value={courseForm.course_name}
            onChange={(e) => setCourseForm({ ...courseForm, course_name: e.target.value })}
            fullWidth
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="説明"
            value={courseForm.description}
            onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCourseDialog(false)}>キャンセル</Button>
          <Button onClick={handleEditCourse} variant="contained">更新</Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>コース削除確認</DialogTitle>
        <DialogContent>
          <DialogContentText>
            「{selectedCourse?.course_name}」を削除しますか？
            この操作は取り消せません。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>キャンセル</Button>
          <Button onClick={handleDeleteCourse} color="error" variant="contained">削除</Button>
        </DialogActions>
      </Dialog>

      {/* 通知 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CourseList;