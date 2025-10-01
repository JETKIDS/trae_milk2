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

const CourseManagement: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

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