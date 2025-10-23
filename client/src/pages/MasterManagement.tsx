import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Tabs,
  Tab,
  TextField,
  Snackbar,
  Alert,
} from '@mui/material';
import { Add as AddIcon, Save as SaveIcon, Delete as DeleteIcon } from '@mui/icons-material';
import axios from 'axios';
import { useCompany } from '../contexts/CompanyContext';

interface Staff {
  id: number;
  staff_name: string;
  phone: string;
  course_name?: string; // 単一割り当ての表示用（後方互換）
  all_course_names?: string; // 複数担当コースの表示用
}

interface Manufacturer {
  id: number;
  manufacturer_name: string;
  contact_info: string;
}

interface CompanyInfo {
  id: number;
  company_name: string;
  company_name_kana_half?: string; // 会社名（読み・半角カナ）
  postal_code: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  representative: string;
  business_hours: string;
  established_date: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

interface InstitutionInfo {
  id: number;
  institution_name: string;
  bank_code_7: string;
  bank_name: string;
  branch_name: string;
  agent_name_half: string; // 委託者名（半角カナ）
  agent_code: string; // 委託者コード
  header_leading_digit: string; // ヘッダー先頭の数字
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`master-tabpanel-${index}`}
      aria-labelledby={`master-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `master-tab-${index}`,
    'aria-controls': `master-tabpanel-${index}`,
  };
}

const MasterManagement: React.FC = () => {
  const { updateCompanyInfo } = useCompany();
  const [tabValue, setTabValue] = useState(0);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    id: 1,
    company_name: '',
    company_name_kana_half: '',
    postal_code: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    representative: '',
    business_hours: '',
    established_date: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [kanaError, setKanaError] = useState<string>('');
  const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/; // 半角カナとスペースのみ

  // 収納機関設定用の状態とバリデーション
  const [institutionInfo, setInstitutionInfo] = useState<InstitutionInfo>({
    id: 1,
    institution_name: '',
    bank_code_7: '',
    bank_name: '',
    branch_name: '',
    agent_name_half: '',
    agent_code: '',
    header_leading_digit: '',
  });
  const [savingInstitution, setSavingInstitution] = useState<boolean>(false);
  const [bankCodeError, setBankCodeError] = useState<string | null>(null);
  const [agentNameError, setAgentNameError] = useState<string | null>(null);
  const [headerDigitError, setHeaderDigitError] = useState<string | null>(null);
  // 収納機関の複数管理用状態
  const [institutions, setInstitutions] = useState<InstitutionInfo[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<number | null>(null);
  useEffect(() => {
    const fetchMasterData = async (): Promise<void> => {
      try {
        const [staffRes, manufacturersRes] = await Promise.all([
          axios.get('/api/masters/staff'),
          axios.get('/api/masters/manufacturers'),
        ]);

        setStaff(staffRes.data);
        setManufacturers(manufacturersRes.data);

        // 会社情報も取得（まだAPIがない場合はデフォルト値を使用）
        try {
          const companyRes = await axios.get('/api/masters/company');
          setCompanyInfo(companyRes.data);
        } catch (error) {
          console.log('会社情報APIがまだ実装されていません');
        }

        try {
          const listRes = await axios.get('/api/masters/institutions');
          const list: InstitutionInfo[] = listRes.data || [];
          setInstitutions(list);
          if (list.length > 0) {
            setInstitutionInfo(list[0]);
            setSelectedInstitutionId(list[0].id ?? null);
          } else {
            setSelectedInstitutionId(null);
          }
        } catch (error) {
          console.log('収納機関一覧APIがまだ実装されていません。単一設定APIの取得を試みます。');
          try {
            const instRes = await axios.get('/api/masters/institution');
            setInstitutionInfo(instRes.data);
          } catch (err) {
            console.log('収納機関設定APIがまだ実装されていません');
          }
        }
      } catch (error) {
        console.error('マスタデータの取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMasterData();
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCompanyInfoChange = (field: keyof CompanyInfo, value: string) => {
    if (field === 'company_name_kana_half') {
      if (value && !halfKanaRegex.test(value)) {
        setKanaError('半角カタカナで入力してください（スペース可）');
      } else {
        setKanaError('');
      }
    }
    setCompanyInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 収納機関設定の入力変更ハンドラ（クライアントバリデーション）
  const handleInstitutionChange = (field: keyof InstitutionInfo, value: string) => {
    // フィールドごとにバリデーション
    if (field === 'bank_code_7') {
      // 半角数字のみ、7桁が有効
      if (value && !/^\d{0,7}$/.test(value)) {
        setBankCodeError('半角数字7桁で入力してください');
      } else if (value.length === 7) {
        setBankCodeError(null);
      } else {
        setBankCodeError('半角数字7桁で入力してください');
      }
    }
    if (field === 'agent_name_half') {
      if (value && (!halfKanaRegex.test(value) || value.length > 16)) {
        setAgentNameError('半角カタカナ・スペースのみ（最大16文字）');
      } else {
        setAgentNameError(null);
      }
    }
    if (field === 'header_leading_digit') {
      if (value && !/^\d+$/.test(value)) {
        setHeaderDigitError('半角数字のみ（桁数不問）');
      } else {
        setHeaderDigitError(null);
      }
    }

    setInstitutionInfo(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // 収納機関設定の保存（複数管理対応）
  const handleSaveInstitution = async () => {
    try {
      setSavingInstitution(true);
      const payload = { ...institutionInfo };
      if (selectedInstitutionId) {
        const res = await axios.put(`/api/masters/institutions/${selectedInstitutionId}`, payload);
        setSnackbar({ open: true, message: res.data?.message || '収納機関を更新しました', severity: 'success' });
      } else {
        const res = await axios.post('/api/masters/institutions', payload);
        setSnackbar({ open: true, message: res.data?.message || '収納機関を作成しました', severity: 'success' });
        const newId = res?.data?.id as number | undefined;
        if (newId) setSelectedInstitutionId(newId);
      }
      await refreshInstitutions();
    } catch (error: any) {
      console.error('収納機関の保存に失敗しました:', error);
      const msg = error?.response?.data?.error || '収納機関の保存に失敗しました';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSavingInstitution(false);
    }
  };
  const refreshStaff = async () => {
    try {
      const res = await axios.get('/api/masters/staff');
      setStaff(res.data);
    } catch (error) {
      console.error('スタッフ一覧更新に失敗しました:', error);
      setSnackbar({ open: true, message: 'スタッフ一覧の更新に失敗しました', severity: 'error' });
    }
  };

  const refreshManufacturers = async () => {
    try {
      const res = await axios.get('/api/masters/manufacturers');
      setManufacturers(res.data);
    } catch (error) {
      console.error('メーカー一覧更新に失敗しました:', error);
      setSnackbar({ open: true, message: 'メーカー一覧の更新に失敗しました', severity: 'error' });
    }
  };

  const handleDeleteStaff = async (member: Staff) => {
    const ok = window.confirm(`スタッフ「${member.staff_name}」を削除します。よろしいですか？`);
    if (!ok) return;
    try {
      await axios.delete(`/api/masters/staff/${member.id}`);
      await refreshStaff();
      setSnackbar({ open: true, message: 'スタッフを削除しました', severity: 'success' });
    } catch (error: any) {
      console.error('スタッフ削除に失敗しました:', error);
      const msg = error?.response?.data?.error || 'スタッフ削除に失敗しました';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  const handleDeleteManufacturer = async (manufacturer: Manufacturer) => {
    const ok = window.confirm(`メーカー「${manufacturer.manufacturer_name}」を削除します。よろしいですか？`);
    if (!ok) return;
    try {
      await axios.delete(`/api/masters/manufacturers/${manufacturer.id}`);
      await refreshManufacturers();
      setSnackbar({ open: true, message: 'メーカーを削除しました', severity: 'success' });
    } catch (error: any) {
      console.error('メーカー削除に失敗しました:', error);
      const msg = error?.response?.data?.error || 'メーカー削除に失敗しました';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  const handleSaveCompanyInfo = async () => {
    try {
      setSaving(true);
      await axios.post('/api/masters/company', companyInfo);
      // コンテキストの状態も更新
      updateCompanyInfo(companyInfo);
      setSnackbar({ open: true, message: '会社情報を保存しました', severity: 'success' });
    } catch (error) {
      console.error('会社情報の保存に失敗しました:', error);
      setSnackbar({ open: true, message: '会社情報の保存に失敗しました', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 収納機関一覧の再取得
  const refreshInstitutions = async () => {
    try {
      const res = await axios.get('/api/masters/institutions');
      const list: InstitutionInfo[] = res.data || [];
      setInstitutions(list);
      if (selectedInstitutionId) {
        const found = list.find(i => i.id === selectedInstitutionId);
        if (found) {
          setInstitutionInfo(found);
        } else if (list.length > 0) {
          setInstitutionInfo(list[0]);
          setSelectedInstitutionId(list[0].id ?? null);
        } else {
          setSelectedInstitutionId(null);
          setInstitutionInfo({
            id: 0,
            institution_name: '',
            bank_code_7: '',
            bank_name: '',
            branch_name: '',
            agent_name_half: '',
            agent_code: '',
            header_leading_digit: '',
          });
        }
      } else if (list.length > 0) {
        setInstitutionInfo(list[0]);
        setSelectedInstitutionId(list[0].id ?? null);
      }
    } catch (error) {
      console.warn('収納機関一覧の更新に失敗しました', error);
    }
  };

  // 行選択
  const handleSelectInstitution = (inst: InstitutionInfo) => {
    setSelectedInstitutionId(inst.id ?? null);
    setInstitutionInfo(inst);
    setBankCodeError(null);
    setAgentNameError(null);
    setHeaderDigitError(null);
  };

  // 追加（新規作成）
  const handleAddInstitution = () => {
    setSelectedInstitutionId(null);
    setInstitutionInfo({
      id: 0,
      institution_name: '',
      bank_code_7: '',
      bank_name: '',
      branch_name: '',
      agent_name_half: '',
      agent_code: '',
      header_leading_digit: '',
    });
    setBankCodeError(null);
    setAgentNameError(null);
    setHeaderDigitError(null);
  };

  // 削除
  const handleDeleteInstitution = async (id?: number) => {
    if (!id) return;
    const ok = window.confirm('選択中の収納機関を削除します。よろしいですか？');
    if (!ok) return;
    try {
      await axios.delete(`/api/masters/institutions/${id}`);
      await refreshInstitutions();
      setSnackbar({ open: true, message: '収納機関を削除しました', severity: 'success' });
    } catch (error: any) {
      console.error('収納機関の削除に失敗しました:', error);
      const msg = error?.response?.data?.error || '収納機関の削除に失敗しました';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        マスタ管理
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="マスタ管理タブ">
          <Tab label="配達スタッフ" {...a11yProps(0)} />
          <Tab label="メーカー" {...a11yProps(1)} />
          <Tab label="会社情報" {...a11yProps(2)} />
          <Tab label="収納機関登録" {...a11yProps(3)} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">配達スタッフ</Typography>
              <Button size="small" startIcon={<AddIcon />}>追加</Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>スタッフ名</TableCell>
                    <TableCell>電話番号</TableCell>
                    <TableCell>担当コース</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {staff.map((member: Staff) => (
                    <TableRow key={member.id} hover>
                      <TableCell>{member.staff_name}</TableCell>
                      <TableCell>{member.phone}</TableCell>
                      <TableCell>{member.all_course_names || member.course_name || '未設定'}</TableCell>
                      <TableCell>
                        <Button 
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDeleteStaff(member)}
                        >
                          削除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">メーカー</Typography>
              <Button size="small" startIcon={<AddIcon />}>追加</Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>メーカー名</TableCell>
                    <TableCell>連絡先</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {manufacturers.map((manufacturer: Manufacturer) => (
                    <TableRow key={manufacturer.id} hover>
                      <TableCell>{manufacturer.manufacturer_name}</TableCell>
                      <TableCell>{manufacturer.contact_info || '-'}</TableCell>
                      <TableCell>
                        <Button 
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDeleteManufacturer(manufacturer)}
                        >
                          削除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">会社情報</Typography>
              <Button 
                variant="contained" 
                startIcon={<SaveIcon />}
                onClick={handleSaveCompanyInfo}
                disabled={saving || !!kanaError}
              >
                {saving ? '保存中...' : '保存'}
              </Button>
            </Box>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="会社名"
                  value={companyInfo.company_name}
                  onChange={(e) => handleCompanyInfoChange('company_name', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="代表者名"
                  value={companyInfo.representative}
                  onChange={(e) => handleCompanyInfoChange('representative', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="会社名（読み・半角カナ）"
                  value={companyInfo.company_name_kana_half || ''}
                  onChange={(e) => handleCompanyInfoChange('company_name_kana_half', e.target.value)}
                  margin="normal"
                  placeholder="ﾆｺﾆｺｷﾞｭｳﾆｭｳ"
                  error={!!kanaError}
                  helperText={kanaError || 'ヘッダーの企業名として参照されます。半角カタカナ・スペースのみ可'}
                  inputProps={{ maxLength: 30 }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="郵便番号"
                  value={companyInfo.postal_code}
                  onChange={(e) => handleCompanyInfoChange('postal_code', e.target.value)}
                  margin="normal"
                  placeholder="123-4567"
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  fullWidth
                  label="住所"
                  value={companyInfo.address}
                  onChange={(e) => handleCompanyInfoChange('address', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="電話番号"
                  value={companyInfo.phone}
                  onChange={(e) => handleCompanyInfoChange('phone', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="FAX番号"
                  value={companyInfo.fax}
                  onChange={(e) => handleCompanyInfoChange('fax', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="メールアドレス"
                  type="email"
                  value={companyInfo.email}
                  onChange={(e) => handleCompanyInfoChange('email', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="営業時間"
                  value={companyInfo.business_hours}
                  onChange={(e) => handleCompanyInfoChange('business_hours', e.target.value)}
                  margin="normal"
                  placeholder="9:00-18:00"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="設立年月日"
                  type="date"
                  value={companyInfo.established_date}
                  onChange={(e) => handleCompanyInfoChange('established_date', e.target.value)}
                  margin="normal"
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">収納機関登録</Typography>
              <Box>
                <Button variant="outlined" sx={{ mr: 1 }} onClick={handleAddInstitution}>追加</Button>
                <Button 
                  variant="contained" 
                  startIcon={<SaveIcon />}
                  onClick={handleSaveInstitution}
                  disabled={savingInstitution || !!bankCodeError || !!agentNameError || !!headerDigitError}
                >
                  {savingInstitution ? '保存中...' : '保存'}
                </Button>
              </Box>
            </Box>

            <TableContainer sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>収納機関名</TableCell>
                    <TableCell>金融機関コード</TableCell>
                    <TableCell>金融機関名</TableCell>
                    <TableCell>支店名</TableCell>
                    <TableCell>委託者名（半角）</TableCell>
                    <TableCell>委託者コード</TableCell>
                    <TableCell>ヘッダー先頭の数字</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {institutions.map((inst) => (
                    <TableRow key={inst.id} hover selected={selectedInstitutionId === inst.id} onClick={() => handleSelectInstitution(inst)} sx={{ cursor: 'pointer' }}>
                      <TableCell>{inst.id}</TableCell>
                      <TableCell>{inst.institution_name}</TableCell>
                      <TableCell>{inst.bank_code_7}</TableCell>
                      <TableCell>{inst.bank_name}</TableCell>
                      <TableCell>{inst.branch_name}</TableCell>
                      <TableCell>{inst.agent_name_half}</TableCell>
                      <TableCell>{inst.agent_code}</TableCell>
                      <TableCell>{inst.header_leading_digit}</TableCell>
                      <TableCell>
                        <Button color="error" size="small" onClick={(e) => { e.stopPropagation(); handleDeleteInstitution(inst.id as number); }}>削除</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {institutions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center">登録された収納機関はありません。右上の「追加」から作成してください。</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* 以降は選択中（または新規）の編集フォーム */}
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="収納機関名"
                  value={institutionInfo.institution_name}
                  onChange={(e) => handleInstitutionChange('institution_name', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="金融機関コード（7桁）"
                  value={institutionInfo.bank_code_7}
                  onChange={(e) => handleInstitutionChange('bank_code_7', e.target.value)}
                  margin="normal"
                  placeholder="1234567"
                  error={!!bankCodeError}
                  helperText={bankCodeError || '半角数字7桁'}
                  inputProps={{ maxLength: 7 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="金融機関名"
                  value={institutionInfo.bank_name}
                  onChange={(e) => handleInstitutionChange('bank_name', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="支店名"
                  value={institutionInfo.branch_name}
                  onChange={(e) => handleInstitutionChange('branch_name', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="委託者名（半角カナ）"
                  value={institutionInfo.agent_name_half}
                  onChange={(e) => handleInstitutionChange('agent_name_half', e.target.value)}
                  margin="normal"
                  placeholder="ﾆｺｽ"
                  error={!!agentNameError}
                  helperText={agentNameError || '半角カタカナ・スペースのみ可（最大16文字）'}
                  inputProps={{ maxLength: 16 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="委託者コード"
                  value={institutionInfo.agent_code}
                  onChange={(e) => handleInstitutionChange('agent_code', e.target.value)}
                  margin="normal"
                  placeholder="123456"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="ヘッダー先頭の数字"
                  value={institutionInfo.header_leading_digit}
                  onChange={(e) => handleInstitutionChange('header_leading_digit', e.target.value)}
                  margin="normal"
                  placeholder="1"
                  error={!!headerDigitError}
                  helperText={headerDigitError || '半角数字（桁数不問）'}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MasterManagement;