import React, { useEffect, useState } from 'react';
import { Box, Typography, Grid, Card, CardContent, List, ListItem, ListItemText, Checkbox, TextField, IconButton, Divider, Select, MenuItem, InputLabel, FormControl } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Add, Delete } from '@mui/icons-material';
import apiClient from '../utils/apiClient';

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

const TasksManagement: React.FC = () => {
  const [dailyTasks, setDailyTasks] = useState<TaskItem[]>([]);
  const [monthlyTasks, setMonthlyTasks] = useState<TaskItem[]>([]);
  const [newDailyTitle, setNewDailyTitle] = useState('');
  const [newMonthlyTitle, setNewMonthlyTitle] = useState('');
  const [newDailyDueTime, setNewDailyDueTime] = useState('');
  const [dailyTemplates, setDailyTemplates] = useState<any[]>([]);
  const [monthlyTemplates, setMonthlyTemplates] = useState<any[]>([]);
  const [tplWeekday, setTplWeekday] = useState<number>(new Date().getDay());
  const [tplDailyTitle, setTplDailyTitle] = useState('');
  const [tplDailyDueTime, setTplDailyDueTime] = useState('');
  const [tplMonthDay, setTplMonthDay] = useState<number>(13);
  const [tplMonthlyTitle, setTplMonthlyTitle] = useState('');
  const [tplMonthlyDueTime, setTplMonthlyDueTime] = useState('');
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetchDailyTasks();
    fetchMonthlyTasks();
    fetchDailyTemplates();
    fetchMonthlyTemplates();
  }, []);

  const fetchDailyTasks = async () => {
    try {
      const res = await apiClient.get(`/api/tasks`, { params: { type: 'daily', date: todayStr } });
      setDailyTasks(res.data);
    } catch {}
  };
  const fetchMonthlyTasks = async () => {
    try {
      const res = await apiClient.get(`/api/tasks`, { params: { type: 'monthly', month: currentMonthStr } });
      setMonthlyTasks(res.data);
    } catch {}
  };
  const addDailyTask = async () => {
    const title = newDailyTitle.trim();
    if (!title) return;
    try {
      const payload: any = { type: 'daily', title, date: todayStr };
      if (newDailyDueTime) payload.due_time = newDailyDueTime;
      await apiClient.post('/api/tasks', payload);
      setNewDailyTitle('');
      setNewDailyDueTime('');
      fetchDailyTasks();
    } catch {}
  };
  const addMonthlyTask = async () => {
    const title = newMonthlyTitle.trim();
    if (!title) return;
    try {
      await apiClient.post('/api/tasks', { type: 'monthly', title, month: currentMonthStr });
      setNewMonthlyTitle('');
      fetchMonthlyTasks();
    } catch {}
  };
  const toggleTaskCompleted = async (task: TaskItem) => {
    try {
      if (task.type === 'daily') {
        setDailyTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
      } else {
        setMonthlyTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
      }
      await apiClient.patch(`/api/tasks/${task.id}`, { completed: !task.completed });
    } catch {}
  };
  const deleteTask = async (task: TaskItem) => {
    try {
      await apiClient.delete(`/api/tasks/${task.id}`);
      if (task.type === 'daily') fetchDailyTasks(); else fetchMonthlyTasks();
    } catch {}
  };

  const fetchDailyTemplates = async () => {
    try { const res = await apiClient.get('/api/tasks/templates/daily'); setDailyTemplates(res.data || []); } catch {}
  };
  const fetchMonthlyTemplates = async () => {
    try { const res = await apiClient.get('/api/tasks/templates/monthly'); setMonthlyTemplates(res.data || []); } catch {}
  };
  const addDailyTemplate = async () => {
    const t = tplDailyTitle.trim(); if (!t) return;
    try { await apiClient.post('/api/tasks/templates/daily', { weekday: tplWeekday, title: t, due_time: tplDailyDueTime || undefined }); setTplDailyTitle(''); setTplDailyDueTime(''); fetchDailyTemplates(); fetchDailyTasks(); } catch {}
  };
  const addMonthlyTemplate = async () => {
    const t = tplMonthlyTitle.trim(); if (!t) return;
    try {
      const payload: any = { title: t, due_time: tplMonthlyDueTime || undefined };
      if (tplMonthDay === 0) payload.is_last_day = true; else payload.day_of_month = tplMonthDay;
      await apiClient.post('/api/tasks/templates/monthly', payload);
      setTplMonthlyTitle(''); setTplMonthlyDueTime(''); fetchMonthlyTemplates(); fetchMonthlyTasks();
    } catch {}
  };
  const deleteDailyTemplate = async (id: number) => { try { await apiClient.delete(`/api/tasks/templates/daily/${id}`); fetchDailyTemplates(); } catch {} };
  const deleteMonthlyTemplate = async (id: number) => { try { await apiClient.delete(`/api/tasks/templates/monthly/${id}`); fetchMonthlyTemplates(); } catch {} };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>タスク管理</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ py: 1 }}>
              <Typography variant="h6" gutterBottom>日別タスク（{todayStr}）</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                <TextField fullWidth size="small" placeholder="タスクを追加（例：前日まとめ）" value={newDailyTitle} onChange={(e) => setNewDailyTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addDailyTask(); }} />
                <TextField size="small" type="time" placeholder="締切" value={newDailyDueTime} onChange={(e) => setNewDailyDueTime(e.target.value)} />
                <IconButton color="primary" onClick={addDailyTask} aria-label="add-daily"><Add /></IconButton>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List dense>
                {dailyTasks.map((t) => (
                  <ListItem key={t.id} sx={{ py: 0.25 }} secondaryAction={<IconButton edge="end" aria-label="delete" onClick={() => deleteTask(t)}><Delete /></IconButton>}>
                    <Checkbox checked={t.completed} onChange={() => toggleTaskCompleted(t)} />
                    <ListItemText primary={t.title} primaryTypographyProps={{ variant: 'body2' }} secondary={t.dueTime ? `締切 ${t.dueTime}` : undefined} />
                  </ListItem>
                ))}
                {dailyTasks.length === 0 && (<ListItem><ListItemText primary="タスクはまだありません" /></ListItem>)}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ py: 1 }}>
              <Typography variant="h6" gutterBottom>月別タスク（{currentMonthStr}）</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                <TextField fullWidth size="small" placeholder="タスクを追加（例：支払い）" value={newMonthlyTitle} onChange={(e) => setNewMonthlyTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMonthlyTask(); }} />
                <IconButton color="primary" onClick={addMonthlyTask} aria-label="add-monthly"><Add /></IconButton>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <List dense>
                {monthlyTasks.map((t) => (
                  <ListItem key={t.id} sx={{ py: 0.25 }} secondaryAction={<IconButton edge="end" aria-label="delete" onClick={() => deleteTask(t)}><Delete /></IconButton>}>
                    <Checkbox checked={t.completed} onChange={() => toggleTaskCompleted(t)} />
                    <ListItemText primary={t.title} primaryTypographyProps={{ variant: 'body2' }} secondary={t.date ? `予定日 ${t.date}` : undefined} />
                  </ListItem>
                ))}
                {monthlyTasks.length === 0 && (<ListItem><ListItemText primary="タスクはまだありません" /></ListItem>)}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>タスクスケジュール設定</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle1" gutterBottom>曜日別（日毎）</Typography>
                <Grid container spacing={2}>
                  {[0,1,2,3,4,5,6].map((wd) => (
                    <Grid item xs={12} sm={6} md={6} key={wd}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        {['日','月','火','水','木','金','土'][wd]}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                        <TextField fullWidth size="small" placeholder="タイトル" value={wd === tplWeekday ? tplDailyTitle : ''} onChange={(e) => { setTplWeekday(wd); setTplDailyTitle(e.target.value); }} />
                        <TextField size="small" type="time" value={wd === tplWeekday ? tplDailyDueTime : ''} onChange={(e) => { setTplWeekday(wd); setTplDailyDueTime(e.target.value); }} />
                        <IconButton color="primary" onClick={() => { setTplWeekday(wd); addDailyTemplate(); }} aria-label={`add-daily-template-${wd}`}><Add /></IconButton>
                      </Box>
                      <List dense>
                        {dailyTemplates.filter((dt: any) => Number(dt.weekday) === wd).map((dt: any) => (
                          <ListItem key={dt.id} sx={{ py: 0.25 }} secondaryAction={<IconButton edge="end" aria-label="delete" onClick={() => deleteDailyTemplate(dt.id)}><Delete /></IconButton>}>
                            <ListItemText primary={dt.title} primaryTypographyProps={{ variant: 'body2' }} secondary={dt.due_time ? `締切 ${dt.due_time}` : undefined} />
                          </ListItem>
                        ))}
                        {dailyTemplates.filter((dt: any) => Number(dt.weekday) === wd).length === 0 && (
                          <ListItem sx={{ py: 0.25 }}><ListItemText primary="未登録" primaryTypographyProps={{ variant: 'body2' }} /></ListItem>
                        )}
                      </List>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle1" gutterBottom>日付別（月毎）</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <StaticDatePicker
                        displayStaticWrapperAs="desktop"
                        value={calendarMonth}
                        onChange={(newVal) => setCalendarMonth(newVal as Date)}
                        onAccept={() => {}}
                        onViewChange={() => {}}
                        sx={{ mb: 1 }}
                      />
                    </LocalizationProvider>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id="monthday-label">日付</InputLabel>
                        <Select labelId="monthday-label" label="日付" value={tplMonthDay} onChange={(e) => setTplMonthDay(Number(e.target.value))}>
                          {Array.from({ length: 31 }).map((_, i) => (
                            <MenuItem key={i+1} value={i+1}>{i+1}日</MenuItem>
                          ))}
                          <MenuItem value={0}>末日</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField fullWidth size="small" placeholder="タイトル" value={tplMonthlyTitle} onChange={(e) => setTplMonthlyTitle(e.target.value)} />
                      <TextField size="small" type="time" value={tplMonthlyDueTime} onChange={(e) => setTplMonthlyDueTime(e.target.value)} />
                      <IconButton color="primary" onClick={addMonthlyTemplate} aria-label="add-monthly-template"><Add /></IconButton>
                    </Box>
                  </Grid>
                </Grid>
                <List dense>
                  {monthlyTemplates.map((mt: any) => (
                    <ListItem key={mt.id} sx={{ py: 0.25 }} secondaryAction={<IconButton edge="end" aria-label="delete" onClick={() => deleteMonthlyTemplate(mt.id)}><Delete /></IconButton>}>
                      <ListItemText primary={mt.title} primaryTypographyProps={{ variant: 'body2' }} secondary={`${mt.is_last_day ? '末日' : `${mt.day_of_month}日`} ${mt.due_time ? `締切 ${mt.due_time}` : ''}`} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default TasksManagement;
