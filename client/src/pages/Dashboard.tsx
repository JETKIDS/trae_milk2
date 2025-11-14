import React, { useState, useEffect } from 'react';
import { Typography, Grid, Card, CardContent, Box, Button, List, ListItem, ListItemText, Checkbox, TextField, IconButton, Divider } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';

interface Stats {
  totalCustomers: number;
  totalProducts: number;
  totalCourses: number;
  totalStaff: number;
}

interface StatCard {
  title: string;
  value: number;
  color: string;
}

interface KPI {
  month: string;
  sales: number;
  grossProfit: number;
  grossProfitRate: number;
  customerCount: number;
  newCustomersCount: number;
  cancelledCustomersCount: number;
  salesGrowthRate: number;
  customerUnitPrice: number;
  churnRate: number;
}

interface TaskItem {
  id: number;
  type: 'daily' | 'monthly';
  title: string;
  note?: string;
  date?: string | null;
  month?: string | null;
  dueTime?: string | null;
  completed: boolean;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalCustomers: 0,
    totalProducts: 0,
    totalCourses: 0,
    totalStaff: 0,
  });
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [dailyTasks, setDailyTasks] = useState<TaskItem[]>([]);
  const [monthlyTasks, setMonthlyTasks] = useState<TaskItem[]>([]);
  const [newDailyTitle, setNewDailyTitle] = useState('');
  const [newMonthlyTitle, setNewMonthlyTitle] = useState('');

  useEffect(() => {
    const fetchStats = async (): Promise<void> => {
      try {
        const [customers, products, courses, staff] = await Promise.all([
          apiClient.get('/api/customers'),
          apiClient.get('/api/products'),
          apiClient.get('/api/masters/courses'),
          apiClient.get('/api/masters/staff'),
        ]);

        setStats({
          totalCustomers: customers.data.length,
          totalProducts: products.data.length,
          totalCourses: courses.data.length,
          totalStaff: staff.data.length,
        });
      } catch (error) {
        console.error('統計データの取得に失敗しました:', error);
      }
    };

    const fetchKPI = async (): Promise<void> => {
      setLoadingKpi(true);
      try {
        const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const response = await apiClient.get(`/api/analyses/kpi?month=${currentMonth}`);
        setKpi(response.data);
      } catch (error) {
        console.error('KPIデータの取得に失敗しました:', error);
      } finally {
        setLoadingKpi(false);
      }
    };

    fetchStats();
    fetchKPI();
    fetchDailyTasks();
    fetchMonthlyTasks();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
  };

  const statCards: StatCard[] = [
    { title: '総顧客数', value: stats.totalCustomers, color: '#1976d2' },
    { title: '商品数', value: stats.totalProducts, color: '#388e3c' },
    { title: 'コース数', value: stats.totalCourses, color: '#f57c00' },
    { title: 'スタッフ数', value: stats.totalStaff, color: '#7b1fa2' },
  ];

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const fetchDailyTasks = async () => {
    try {
      const res = await apiClient.get(`/api/tasks`, { params: { type: 'daily', date: todayStr } });
      setDailyTasks(res.data);
    } catch (e) {
      console.error('日別タスクの取得に失敗しました:', e);
    }
  };

  const fetchMonthlyTasks = async () => {
    try {
      const res = await apiClient.get(`/api/tasks`, { params: { type: 'monthly', month: currentMonthStr } });
      setMonthlyTasks(res.data);
    } catch (e) {
      console.error('月別タスクの取得に失敗しました:', e);
    }
  };

  const addDailyTask = async () => {
    const title = newDailyTitle.trim();
    if (!title) return;
    try {
      await apiClient.post('/api/tasks', { type: 'daily', title, date: todayStr });
      setNewDailyTitle('');
      fetchDailyTasks();
    } catch (e) {
      console.error('日別タスクの追加に失敗しました:', e);
    }
  };

  const addMonthlyTask = async () => {
    const title = newMonthlyTitle.trim();
    if (!title) return;
    try {
      await apiClient.post('/api/tasks', { type: 'monthly', title, month: currentMonthStr });
      setNewMonthlyTitle('');
      fetchMonthlyTasks();
    } catch (e) {
      console.error('月別タスクの追加に失敗しました:', e);
    }
  };

  const toggleTaskCompleted = async (task: TaskItem) => {
    try {
      if (task.type === 'daily') {
        setDailyTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
      } else {
        setMonthlyTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
      }
      await apiClient.patch(`/api/tasks/${task.id}`, { completed: !task.completed });
      if (task.type === 'daily') {
        fetchDailyTasks();
      } else {
        fetchMonthlyTasks();
      }
    } catch (e) {
      console.error('タスク完了更新に失敗しました:', e);
    }
  };

  const deleteTask = async (task: TaskItem) => {
    try {
      await apiClient.delete(`/api/tasks/${task.id}`);
      if (task.type === 'daily') {
        fetchDailyTasks();
      } else {
        fetchMonthlyTasks();
      }
    } catch (e) {
      console.error('タスク削除に失敗しました:', e);
    }
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        ダッシュボード
      </Typography>
      
      <Grid container spacing={3}>
        {statCards.map((card: StatCard, index: number) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {card.title}
                </Typography>
                <Typography variant="h4" component="div" sx={{ color: card.color }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {kpi && (
        <Box sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              今月の経営指標 ({kpi.month})
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/analyses')}
            >
              詳細を見る
            </Button>
          </Box>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    今月の売上
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#1976d2', mb: 1 }}>
                    {formatCurrency(kpi.sales)}
                  </Typography>
                  {kpi.salesGrowthRate !== 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {kpi.salesGrowthRate > 0 ? (
                        <TrendingUp sx={{ color: '#388e3c', fontSize: 16 }} />
                      ) : (
                        <TrendingDown sx={{ color: '#d32f2f', fontSize: 16 }} />
                      )}
                      <Typography
                        variant="body2"
                        sx={{ color: kpi.salesGrowthRate > 0 ? '#388e3c' : '#d32f2f' }}
                      >
                        {kpi.salesGrowthRate > 0 ? '+' : ''}{kpi.salesGrowthRate.toFixed(1)}%
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    今月の粗利
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#388e3c', mb: 1 }}>
                    {formatCurrency(kpi.grossProfit)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    粗利率: {kpi.grossProfitRate.toFixed(1)}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    新規顧客数
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#1976d2' }}>
                    {kpi.newCustomersCount}件
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    解約客数
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#d32f2f' }}>
                    {kpi.cancelledCustomersCount}件
                  </Typography>
                  {kpi.churnRate > 0 && (
                    <Typography variant="body2" color="textSecondary">
                      解約率: {kpi.churnRate.toFixed(1)}%
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    顧客単価
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#f57c00' }}>
                    {formatCurrency(kpi.customerUnitPrice)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    在籍顧客数
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#7b1fa2' }}>
                    {kpi.customerCount}件
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          システム概要
        </Typography>
        <Typography variant="body1" paragraph>
          牛乳配達顧客管理システムへようこそ。このシステムでは以下の機能をご利用いただけます：
        </Typography>
        <Box component="ul" sx={{ pl: 2 }}>
          <Box component="li" sx={{ mb: 1 }}>顧客情報の管理</Box>
          <Box component="li" sx={{ mb: 1 }}>商品・配達パターンの設定</Box>
          <Box component="li" sx={{ mb: 1 }}>月次配達カレンダーの表示</Box>
          <Box component="li" sx={{ mb: 1 }}>請求書の生成</Box>
          <Box component="li" sx={{ mb: 1 }}>配達コース・スタッフの管理</Box>
        </Box>
      </Box>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                日別タスク（{todayStr}）
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="タスクを追加（例：前日まとめ）"
                  value={newDailyTitle}
                  onChange={(e) => setNewDailyTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addDailyTask(); }}
                />
                <IconButton color="primary" onClick={addDailyTask} aria-label="add-daily">
                  <Add />
                </IconButton>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List>
                {dailyTasks.map((t) => (
                  <ListItem key={t.id} secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={() => deleteTask(t)}>
                      <Delete />
                    </IconButton>
                  }>
                    <Checkbox checked={t.completed} onChange={() => toggleTaskCompleted(t)} />
                    <ListItemText
                      primary={t.title}
                      secondary={t.dueTime ? `締切 ${t.dueTime}` : undefined}
                      primaryTypographyProps={{ sx: { textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? 'text.secondary' : 'text.primary' } }}
                    />
                  </ListItem>
                ))}
                {dailyTasks.length === 0 && (
                  <ListItem>
                    <ListItemText primary="タスクはまだありません" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                月別タスク（{currentMonthStr}）
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="タスクを追加（例：支払い）"
                  value={newMonthlyTitle}
                  onChange={(e) => setNewMonthlyTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addMonthlyTask(); }}
                />
                <IconButton color="primary" onClick={addMonthlyTask} aria-label="add-monthly">
                  <Add />
                </IconButton>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List>
                {monthlyTasks.map((t) => (
                  <ListItem key={t.id} secondaryAction={
                    <IconButton edge="end" aria-label="delete" onClick={() => deleteTask(t)}>
                      <Delete />
                    </IconButton>
                  }>
                    <Checkbox checked={t.completed} onChange={() => toggleTaskCompleted(t)} />
                    <ListItemText
                      primary={t.title}
                      primaryTypographyProps={{ sx: { textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? 'text.secondary' : 'text.primary' } }}
                    />
                  </ListItem>
                ))}
                {monthlyTasks.length === 0 && (
                  <ListItem>
                    <ListItemText primary="タスクはまだありません" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
