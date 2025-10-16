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
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import axios from 'axios';
import moment from 'moment';

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

const CourseList: React.FC = () => {
  // タブ管理
  const [tabValue, setTabValue] = useState(0);
  
  // コース一覧用の状態
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [searchName, setSearchName] = useState('');
  
  // 配達順管理用の状態
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  // 新規コース追加モーダル用状態
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newCourseCustomId, setNewCourseCustomId] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('');
  const [newCourseDescription, setNewCourseDescription] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [staffOptions, setStaffOptions] = useState<Staff[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);

  // 顧客コース移動用の状態
  const [sourceCourseId, setSourceCourseId] = useState<number | ''>('');
  const [targetCourseId, setTargetCourseId] = useState<number | ''>('');
  const [sourceCustomers, setSourceCustomers] = useState<Customer[]>([]);
  const [targetCustomers, setTargetCustomers] = useState<Customer[]>([]);
  const [loadingMove, setLoadingMove] = useState(false);

  // タブ切り替え時の状態管理
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingTabValue, setPendingTabValue] = useState<number | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // 各タブの初期状態を保存
  const [initialStates, setInitialStates] = useState({
    deliveryOrder: {
      selectedCourseId: '',
      customers: [] as Customer[]
    },
    customerMove: {
      sourceCourseId: '',
      targetCourseId: '',
      sourceCustomers: [] as Customer[],
      targetCustomers: [] as Customer[]
    }
  });

  const fetchCourses = useCallback(async (): Promise<void> => {
    try {
      const params = new URLSearchParams();
      if (searchId.trim()) params.append('searchId', searchId.trim());
      if (searchName.trim()) params.append('searchName', searchName.trim());
      
      const response = await axios.get(`/api/masters/courses?${params.toString()}`);
      setCourses(response.data);
    } catch (error) {
      console.error('コースデータの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  }, [searchId, searchName]);

  const handleDeleteCourse = async (course: Course) => {
    const ok = window.confirm(`コース「${course.course_name}」を削除します。よろしいですか？`);
    if (!ok) return;
    try {
      await axios.delete(`/api/masters/courses/${course.id}`);
      await fetchCourses();
      setSnackbarMessage('コースを削除しました');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (err: any) {
      console.error('コース削除に失敗:', err);
      const msg = err?.response?.data?.error || 'コース削除に失敗しました';
      setSnackbarMessage(msg);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleSearchIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchId(event.target.value);
  };

  const handleSearchNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchName(event.target.value);
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
    return '999';
  };

  // 新規コースモーダルの開閉
  const openNewCourseDialog = () => {
    setNewCourseCustomId(generateThreeDigitId());
    setNewCourseName('');
    setSelectedStaffId('');
    setNewCourseDescription('');
    setIsEditMode(false);
    setEditingCourseId(null);
    setNewDialogOpen(true);
    fetchStaffOptions();
  };

  const openEditCourseDialog = async (course: Course) => {
    setIsEditMode(true);
    setEditingCourseId(course.id);
    setNewCourseCustomId(course.custom_id || '');
    setNewCourseName(course.course_name);
    setNewCourseDescription(course.description || '');
    setNewDialogOpen(true);
    try {
      const res = await axios.get('/api/masters/staff');
      const options: Staff[] = res.data;
      setStaffOptions(options);
      // コースの現在の担当者を取得
      try {
        const assigned = await axios.get(`/api/masters/courses/${course.id}/assigned-staff`);
        const staffRow = assigned.data; // { staff_id, staff_name } | null
        setSelectedStaffId(staffRow?.staff_id ? staffRow.staff_id : '');
      } catch (e) {
        console.error('担当スタッフ取得に失敗:', e);
        setSelectedStaffId('');
      }
    } catch (err) {
      console.error('スタッフ一覧の取得に失敗しました:', err);
      setSnackbarMessage('スタッフ一覧の取得に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const closeNewCourseDialog = () => {
    if (creatingCourse) return; // 作成中は閉じない
    setNewDialogOpen(false);
    setIsEditMode(false);
    setEditingCourseId(null);
  };

  const fetchStaffOptions = async () => {
    try {
      const res = await axios.get('/api/masters/staff');
      setStaffOptions(res.data);
    } catch (err) {
      console.error('スタッフ一覧の取得に失敗しました:', err);
      setSnackbarMessage('スタッフ一覧の取得に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // 新規コース保存
  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) {
      setSnackbarMessage('コース名を入力してください');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    setCreatingCourse(true);
    try {
      if (isEditMode && editingCourseId) {
        // 更新処理
        const payload = {
          custom_id: newCourseCustomId,
          course_name: newCourseName.trim(),
          description: newCourseDescription.trim() || undefined,
        };
        await axios.put(`/api/masters/courses/${editingCourseId}`, payload);
        // 担当者を再設定（未選択ならクリア）
        try {
          await axios.post(`/api/masters/courses/${editingCourseId}/staff-assign`, { staff_id: selectedStaffId ? Number(selectedStaffId) : null });
        } catch (e) {
          console.error('担当者割り当ての更新に失敗:', e);
          setSnackbarMessage('コースは更新しましたが、担当者の割り当て更新に失敗しました');
          setSnackbarSeverity('error');
          setSnackbarOpen(true);
        }
      } else {
        // 作成処理
        const payload = {
          custom_id: newCourseCustomId,
          course_name: newCourseName.trim(),
          description: newCourseDescription.trim() || undefined,
        };
        const res = await axios.post('/api/masters/courses', payload);

        // 既存スタッフの割り当て
        const createdCourseId = res.data?.id;
        try {
          await axios.post(`/api/masters/courses/${createdCourseId}/staff-assign`, { staff_id: selectedStaffId ? Number(selectedStaffId) : null });
        } catch (e) {
          console.error('担当者割り当てに失敗:', e);
          setSnackbarMessage('コースは作成しましたが、担当者の割り当てに失敗しました');
          setSnackbarSeverity('error');
          setSnackbarOpen(true);
        }
      }

      await fetchCourses();
      setSnackbarMessage(isEditMode ? 'コース情報を更新しました' : '新規コースを作成しました');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setNewDialogOpen(false);
    } catch (err: any) {
      console.error('コース作成に失敗:', err);
      const msg = err?.response?.data?.error || (isEditMode ? 'コース更新に失敗しました' : 'コース作成に失敗しました');
      setSnackbarMessage(msg);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setCreatingCourse(false);
    }
  };

  // 配達順管理用の関数
  const fetchCustomersByCourse = async (courseId: number): Promise<void> => {
    console.log('Fetching customers for course:', courseId);
    setLoadingCustomers(true);
    try {
      const response = await axios.get(`/api/customers/by-course/${courseId}`);
      console.log('API response:', response.data);
      
      const sortedCustomers = response.data.sort((a: Customer, b: Customer) => a.delivery_order - b.delivery_order);
      console.log('Sorted customers:', sortedCustomers);
      
      setCustomers(sortedCustomers);
    } catch (error) {
      console.error('顧客データの取得に失敗しました:', error);
      setSnackbarMessage('顧客データの取得に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleCourseChange = (event: any) => {
    const courseId = event.target.value;
    setSelectedCourseId(courseId);
    // コース選択だけでは未保存状態にしない
    if (courseId) {
      fetchCustomersByCourse(courseId);
    } else {
      setCustomers([]);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    console.log('Drag end result:', result);
    
    if (!result.destination) {
      console.log('No destination, drag cancelled');
      return;
    }

    const items = Array.from(customers);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedCustomers = items.map((customer, index) => ({
      ...customer,
      delivery_order: index + 1,
    }));

    console.log('Updated customers after drag:', updatedCustomers);
    setCustomers(updatedCustomers);
    setHasUnsavedChanges(true); // ドラッグ&ドロップで変更を記録
  };

  const handleSaveOrder = async () => {
    if (!selectedCourseId) {
      setSnackbarMessage('コースを選択してください');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    console.log('Saving order for course:', selectedCourseId);
    console.log('Data to save:', customers.map(c => ({ id: c.id, delivery_order: c.delivery_order })));

    try {
      const updateData = customers.map(customer => ({
        id: customer.id,
        delivery_order: customer.delivery_order,
      }));

      const response = await axios.put('/api/customers/delivery-order/bulk', {
        updates: updateData,
      });

      console.log('Save response:', response.data);

      // 保存成功時に未保存フラグをリセット
      setHasUnsavedChanges(false);
      
      setSnackbarMessage('配達順序を保存しました');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('配達順序の保存に失敗しました:', error);
      setSnackbarMessage('配達順序の保存に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // 未保存の変更をチェックする関数
  const checkForUnsavedChanges = (): boolean => {
    if (tabValue === 1) { // 配達順管理タブ
      const hasChanges = 
        selectedCourseId !== initialStates.deliveryOrder.selectedCourseId ||
        JSON.stringify(customers) !== JSON.stringify(initialStates.deliveryOrder.customers);
      return hasChanges;
    } else if (tabValue === 2) { // 顧客コース移動タブ
      const hasChanges = 
        sourceCourseId !== initialStates.customerMove.sourceCourseId ||
        targetCourseId !== initialStates.customerMove.targetCourseId ||
        JSON.stringify(sourceCustomers) !== JSON.stringify(initialStates.customerMove.sourceCustomers) ||
        JSON.stringify(targetCustomers) !== JSON.stringify(initialStates.customerMove.targetCustomers);
      return hasChanges;
    }
    return false;
  };

  // タブの状態をクリアする関数
  const clearTabState = (targetTab: number) => {
    if (targetTab === 1) { // 配達順管理タブ
      setSelectedCourseId('');
      setCustomers([]);
      setLoadingCustomers(false);
    } else if (targetTab === 2) { // 顧客コース移動タブ
      setSourceCourseId('');
      setTargetCourseId('');
      setSourceCustomers([]);
      setTargetCustomers([]);
      setLoadingMove(false);
    }
  };

  // 初期状態を更新する関数
  const updateInitialState = (targetTab: number) => {
    if (targetTab === 1) {
      setInitialStates(prev => ({
        ...prev,
        deliveryOrder: {
          selectedCourseId: '',
          customers: []
        }
      }));
    } else if (targetTab === 2) {
      setInitialStates(prev => ({
        ...prev,
        customerMove: {
          sourceCourseId: '',
          targetCourseId: '',
          sourceCustomers: [],
          targetCustomers: []
        }
      }));
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    // 現在のタブで未保存の変更があるかチェック
    if (checkForUnsavedChanges()) {
      setPendingTabValue(newValue);
      setConfirmDialogOpen(true);
    } else {
      // 変更がない場合は直接タブを切り替え、状態をクリア
      clearTabState(newValue);
      updateInitialState(newValue);
      setTabValue(newValue);
      setHasUnsavedChanges(false);
    }
  };

  // 確認ダイアログでの処理
  const handleConfirmTabChange = () => {
    if (pendingTabValue !== null) {
      clearTabState(pendingTabValue);
      updateInitialState(pendingTabValue);
      setTabValue(pendingTabValue);
      setHasUnsavedChanges(false);
      setPendingTabValue(null);
    }
    setConfirmDialogOpen(false);
  };

  const handleCancelTabChange = () => {
    setPendingTabValue(null);
    setConfirmDialogOpen(false);
  };

  // 顧客移動の変更を保存する関数
  const handleSaveCustomerMoves = async () => {
    if (!hasUnsavedChanges) {
      setSnackbarMessage('保存する変更がありません');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    setLoadingMove(true);
    try {
      // データを最新状態に更新
      if (sourceCourseId) {
        await fetchCustomersForMove(sourceCourseId as number, true);
      }
      if (targetCourseId) {
        await fetchCustomersForMove(targetCourseId as number, false);
      }

      // 現在の状態を初期状態として保存
      setInitialStates(prev => ({
        ...prev,
        customerMove: {
          sourceCourseId: sourceCourseId as string,
          targetCourseId: targetCourseId as string,
          sourceCustomers: [...sourceCustomers],
          targetCustomers: [...targetCustomers]
        }
      }));

      // 未保存フラグをリセット
      setHasUnsavedChanges(false);

      setSnackbarMessage('変更を保存しました');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // コース一覧も更新
      await fetchCourses();
    } catch (error) {
      console.error('Error saving customer moves:', error);
      setSnackbarMessage('保存に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setLoadingMove(false);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // 顧客コース移動用の関数
  const fetchCustomersForMove = async (courseId: number, isSource: boolean) => {
    console.log('📊 fetchCustomersForMove 開始:', { courseId, isSource });
    try {
      setLoadingMove(true);
      const response = await axios.get(`/api/customers/by-course/${courseId}`);
      console.log('📊 顧客データ取得成功:', { 
        courseId, 
        isSource, 
        dataCount: response.data.length,
        data: response.data 
      });
      
      if (isSource) {
        setSourceCustomers(response.data);
        console.log('📊 ソース顧客リスト更新:', response.data.length, '件');
      } else {
        setTargetCustomers(response.data);
        console.log('📊 ターゲット顧客リスト更新:', response.data.length, '件');
      }
    } catch (error) {
      console.error('❌ 顧客データの取得に失敗しました:', error);
      setSnackbarMessage('顧客データの取得に失敗しました');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setLoadingMove(false);
      console.log('📊 fetchCustomersForMove 完了:', { courseId, isSource });
    }
  };

  const handleSourceCourseChange = (courseId: number | '') => {
    setSourceCourseId(courseId);
    // コース選択だけでは未保存状態にしない
    if (courseId) {
      fetchCustomersForMove(courseId, true);
    } else {
      setSourceCustomers([]);
    }
  };

  const handleTargetCourseChange = (courseId: number | '') => {
    setTargetCourseId(courseId);
    // コース選択だけでは未保存状態にしない
    if (courseId) {
      fetchCustomersForMove(courseId, false);
    } else {
      setTargetCustomers([]);
    }
  };

  const handleMoveCustomers = async (customerIds: number[]) => {
    console.log('🔧 handleMoveCustomers 開始:', { customerIds, targetCourseId, sourceCourseId });
    
    if (!targetCourseId) {
      console.log('❌ targetCourseId が設定されていません');
      setSnackbarMessage('移動先のコースを選択してください');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    try {
      setLoadingMove(true);
      // 顧客移動開始時に未保存状態にする
      setHasUnsavedChanges(true);
      
      // まずヘルスチェックでサーバー接続を確認
      console.log('🔍 サーバー接続テスト開始...');
      try {
        const healthResponse = await axios.get('/api/health');
        console.log('✅ サーバー接続成功:', healthResponse.data);
      } catch (healthError) {
        console.error('❌ サーバー接続失敗:', healthError);
      }
      
      console.log('📡 API呼び出し開始:', {
        url: '/api/customers/move-course',
        fullUrl: axios.defaults.baseURL + '/api/customers/move-course',
        data: { customerIds, newCourseId: targetCourseId }
      });
      
      // リクエスト詳細をログ出力
      const requestConfig = {
        method: 'PUT',
        url: '/api/customers/move-course',
        baseURL: axios.defaults.baseURL,
        data: {
          customerIds,
          newCourseId: targetCourseId,
        }
      };
      console.log('🔧 リクエスト設定詳細:', requestConfig);
      
      const response = await axios.put('/api/customers/move-course', {
        customerIds,
        newCourseId: targetCourseId,
      });

      console.log('✅ API呼び出し成功:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers
      });
      setSnackbarMessage(response.data.message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // 顧客移動後も未保存状態を維持（保存ボタンで明示的に保存するまで）

      // データを再取得
      console.log('🔄 データ再取得開始:', { sourceCourseId, targetCourseId });
      if (sourceCourseId) {
        console.log('📥 ソースコースのデータ再取得:', sourceCourseId);
        fetchCustomersForMove(sourceCourseId, true);
      }
      if (targetCourseId) {
        console.log('📥 ターゲットコースのデータ再取得:', targetCourseId);
        fetchCustomersForMove(targetCourseId, false);
      }
    } catch (error: any) {
      console.error('❌ 顧客のコース移動に失敗しました:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      const errorMessage = error.response?.data?.error || '顧客のコース移動に失敗しました';
      setSnackbarMessage(errorMessage);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setLoadingMove(false);
      console.log('🏁 handleMoveCustomers 完了');
    }
  };

  const handleMoveDragEnd = (result: DropResult) => {
    console.log('🔄 ドラッグアンドドロップ開始:', result);
    
    if (!result.destination) {
      console.log('❌ destination が null のため処理を中止');
      return;
    }

    const { source, destination } = result;
    console.log('📍 source:', source);
    console.log('📍 destination:', destination);

    // source-customers から target-customers への移動のみ許可
    if (source.droppableId === 'source-customers' && destination.droppableId === 'target-customers') {
      console.log('✅ 有効な移動: source-customers → target-customers');
      const customer = sourceCustomers[source.index];
      console.log('👤 移動対象の顧客:', customer);
      console.log('🎯 移動先コースID:', targetCourseId);
      
      if (customer && targetCourseId) {
        console.log('🚀 handleMoveCustomers を呼び出し:', [customer.id]);
        handleMoveCustomers([customer.id]);
      } else {
        console.log('❌ 顧客またはtargetCourseIdが不正:', { customer, targetCourseId });
      }
    } else {
      console.log('❌ 無効な移動:', { sourceId: source.droppableId, destId: destination.droppableId });
    }
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  // コース一覧タブのコンテンツ
  const renderCourseListTab = () => (
    <Box>
      {/* 検索フィールド */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="コースID"
                placeholder="コースIDで検索"
                value={searchId}
                onChange={handleSearchIdChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="コース名"
                placeholder="コース名で検索"
                value={searchName}
                onChange={handleSearchNameChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* コース一覧 */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">配達コース一覧</Typography>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />}
              onClick={openNewCourseDialog}
            >
              新規追加
            </Button>
          </Box>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>コースID</TableCell>
                  <TableCell>コース名</TableCell>
                  <TableCell>説明</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {courses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography color="textSecondary">
                        {searchId || searchName ? '検索条件に一致するコースが見つかりません' : 'コースが登録されていません'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  courses.map((course: Course) => (
                    <TableRow key={course.id} hover>
                      <TableCell>
                        <Chip 
                          label={course.custom_id || `#${course.id}`} 
                          variant="outlined"
                          size="small"
                          color="primary"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body1" fontWeight="medium">
                          {course.course_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{course.description || '-'}</TableCell>
                      <TableCell align="center">
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
                          onClick={() => handleDeleteCourse(course)}
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
        </CardContent>
      </Card>
    </Box>
  );

  // 配達順管理タブのコンテンツ
  const renderDeliveryOrderTab = () => (
    <Box>
      {/* コース選択 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>配達コース</InputLabel>
                <Select
                  value={selectedCourseId}
                  label="配達コース"
                  onChange={handleCourseChange}
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
            <Grid item xs={12} md={6}>
              <Button
                variant="outlined"
                onClick={async () => {
                  if (!selectedCourseId) return;
                  const y = moment().year();
                  const m = moment().month() + 1;
                  try {
                    const res = await axios.post('/api/customers/invoices/confirm-batch', {
                      year: y,
                      month: m,
                      course_id: selectedCourseId,
                    });
                    alert(`当月の月次請求を確定しました（対象 ${res.data?.count ?? 0} 件）`);
                  } catch (err) {
                    console.error('一括確定エラー', err);
                    alert('月次請求の一括確定に失敗しました。時間をおいて再度お試しください。');
                  }
                }}
                disabled={!selectedCourseId}
                fullWidth
              >
                コース月次確定（今月）
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 顧客リスト */}
      {selectedCourseId && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              配達順序管理
            </Typography>
            
            {loadingCustomers ? (
              <Typography>読み込み中...</Typography>
            ) : (
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
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );

  // 顧客コース移動タブのコンテンツ
  const renderCustomerMoveTab = () => (
    <Box>
      {/* コース選択 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            コース選択
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>移動元コース</InputLabel>
                <Select
                  value={sourceCourseId}
                  label="移動元コース"
                  onChange={(e) => handleSourceCourseChange(e.target.value as number | '')}
                >
                  <MenuItem value="">
                    <em>移動元コースを選択してください</em>
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
              <FormControl fullWidth>
                <InputLabel>移動先コース</InputLabel>
                <Select
                  value={targetCourseId}
                  label="移動先コース"
                  onChange={(e) => handleTargetCourseChange(e.target.value as number | '')}
                >
                  <MenuItem value="">
                    <em>移動先コースを選択してください</em>
                  </MenuItem>
                  {courses.filter(course => course.id !== sourceCourseId).map((course) => (
                    <MenuItem key={course.id} value={course.id}>
                      {course.course_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ドラッグ&ドロップエリア */}
      {sourceCourseId && targetCourseId && (
        <DragDropContext onDragEnd={handleMoveDragEnd}>
          <Grid container spacing={3}>
            {/* 移動元コース */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    移動元: {courses.find(c => c.id === sourceCourseId)?.course_name}
                  </Typography>
                  <Droppable droppableId="source-customers">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          minHeight: 200,
                          backgroundColor: snapshot.isDraggingOver ? '#e3f2fd' : '#f5f5f5',
                          padding: 8,
                          borderRadius: 4,
                          border: '2px dashed #ccc',
                        }}
                      >
                        {sourceCustomers.map((customer, index) => (
                          <Draggable
                            key={`source-${customer.id}`}
                            draggableId={`source-${customer.id}`}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <Paper
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                sx={{
                                  p: 2,
                                  mb: 1,
                                  backgroundColor: snapshot.isDragging ? '#fff3e0' : 'white',
                                  border: snapshot.isDragging ? '2px solid #ff9800' : '1px solid #e0e0e0',
                                  cursor: 'grab',
                                  '&:hover': {
                                    backgroundColor: '#f9f9f9',
                                  },
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <DragIndicatorIcon color="action" sx={{ mr: 1 }} />
                                  <Box>
                                    <Typography variant="subtitle2" fontWeight="bold">
                                      {customer.customer_name}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                      ID: {customer.custom_id}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Paper>
                            )}
                          </Draggable>
                        ))}
                        {sourceCustomers.length === 0 && (
                          <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body2" color="textSecondary">
                              このコースには顧客が登録されていません
                            </Typography>
                          </Box>
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </CardContent>
              </Card>
            </Grid>

            {/* 移動先コース */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    移動先: {courses.find(c => c.id === targetCourseId)?.course_name}
                  </Typography>
                  <Droppable droppableId="target-customers">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          minHeight: 200,
                          backgroundColor: snapshot.isDraggingOver ? '#e8f5e8' : '#f5f5f5',
                          padding: 8,
                          borderRadius: 4,
                          border: '2px dashed #4caf50',
                        }}
                      >
                        {targetCustomers.map((customer, index) => (
                          <Paper
                            key={`target-${customer.id}`}
                            sx={{
                              p: 2,
                              mb: 1,
                              backgroundColor: 'white',
                              border: '1px solid #e0e0e0',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="subtitle2" fontWeight="bold">
                                  {customer.customer_name}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                  ID: {customer.custom_id}
                                </Typography>
                              </Box>
                            </Box>
                          </Paper>
                        ))}
                        {targetCustomers.length === 0 && (
                          <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography variant="body2" color="textSecondary">
                              このコースには顧客が登録されていません
                            </Typography>
                          </Box>
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </DragDropContext>
      )}

      {/* 保存ボタン */}
      {sourceCourseId && targetCourseId && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<SaveIcon />}
            onClick={handleSaveCustomerMoves}
            disabled={!hasUnsavedChanges || loadingMove}
            sx={{ minWidth: 200 }}
          >
            {loadingMove ? '保存中...' : '変更を保存'}
          </Button>
          {hasUnsavedChanges && (
            <Typography 
              variant="body2" 
              color="warning.main" 
              sx={{ 
                display: 'flex', 
                alignItems: 'center',
                fontWeight: 'medium'
              }}
            >
              ※ 未保存の変更があります
            </Typography>
          )}
        </Box>
      )}

      {(!sourceCourseId || !targetCourseId) && (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="textSecondary">
                移動元と移動先のコースを選択してください
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                移動元コースから顧客をドラッグして移動先コースにドロップしてください
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        コース管理
      </Typography>

      {/* タブ */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="コース一覧" />
          <Tab label="配達順管理" />
          <Tab label="顧客コース移動" />
        </Tabs>
      </Box>

      {/* タブコンテンツ */}
      {tabValue === 0 && renderCourseListTab()}
      {tabValue === 1 && renderDeliveryOrderTab()}
      {tabValue === 2 && renderCustomerMoveTab()}

      {/* 新規コース追加モーダル */}
      <Dialog open={newDialogOpen} onClose={closeNewCourseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{isEditMode ? 'コースの編集' : '新規コースの作成'}</DialogTitle>
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
                disabled={isEditMode}
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
          <Button onClick={closeNewCourseDialog} disabled={creatingCourse}>キャンセル</Button>
          <Button onClick={handleCreateCourse} variant="contained" startIcon={<SaveIcon />} disabled={creatingCourse}>
            {creatingCourse ? (isEditMode ? '更新中...' : '作成中...') : (isEditMode ? '更新する' : '作成する')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* スナックバー */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* 未保存変更の確認ダイアログ */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelTabChange}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogTitle id="confirm-dialog-title">
          未保存の変更があります
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-dialog-description">
            現在のタブに未保存の変更があります。タブを切り替えると変更内容が失われますが、よろしいですか？
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelTabChange} color="primary">
            キャンセル
          </Button>
          <Button onClick={handleConfirmTabChange} color="primary" variant="contained">
            変更を破棄して切り替え
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CourseList;