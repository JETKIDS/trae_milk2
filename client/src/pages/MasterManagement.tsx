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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
  Alert,
} from '@mui/material';
import { Add as AddIcon, Save as SaveIcon } from '@mui/icons-material';
import axios from 'axios';

interface Staff {
  id: number;
  staff_name: string;
  phone: string;
  course_name: string;
}

interface Manufacturer {
  id: number;
  manufacturer_name: string;
  contact_info: string;
}

interface CompanyInfo {
  id: number;
  company_name: string;
  postal_code: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  representative: string;
  business_hours: string;
  established_date: string;
  capital: string;
  business_description: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
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
  const [tabValue, setTabValue] = useState(0);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    id: 1,
    company_name: '',
    postal_code: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    representative: '',
    business_hours: '',
    established_date: '',
    capital: '',
    business_description: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

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
    setCompanyInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveCompanyInfo = async () => {
    try {
      setSaving(true);
      await axios.post('/api/masters/company', companyInfo);
      setSnackbar({ open: true, message: '会社情報を保存しました', severity: 'success' });
    } catch (error) {
      console.error('会社情報の保存に失敗しました:', error);
      setSnackbar({ open: true, message: '会社情報の保存に失敗しました', severity: 'error' });
    } finally {
      setSaving(false);
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {staff.map((member: Staff) => (
                    <TableRow key={member.id} hover>
                      <TableCell>{member.staff_name}</TableCell>
                      <TableCell>{member.phone}</TableCell>
                      <TableCell>{member.course_name || '未設定'}</TableCell>
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {manufacturers.map((manufacturer: Manufacturer) => (
                    <TableRow key={manufacturer.id} hover>
                      <TableCell>{manufacturer.manufacturer_name}</TableCell>
                      <TableCell>{manufacturer.contact_info || '-'}</TableCell>
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
                disabled={saving}
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
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="資本金"
                  value={companyInfo.capital}
                  onChange={(e) => handleCompanyInfoChange('capital', e.target.value)}
                  margin="normal"
                  placeholder="1,000万円"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="事業内容"
                  multiline
                  rows={4}
                  value={companyInfo.business_description}
                  onChange={(e) => handleCompanyInfoChange('business_description', e.target.value)}
                  margin="normal"
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