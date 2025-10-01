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
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
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

const MasterManagement: React.FC = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMasterData = async (): Promise<void> => {
      try {
        const [staffRes, manufacturersRes] = await Promise.all([
          axios.get('/api/masters/staff'),
          axios.get('/api/masters/manufacturers'),
        ]);

        setStaff(staffRes.data);
        setManufacturers(manufacturersRes.data);
      } catch (error) {
        console.error('マスタデータの取得に失敗しました:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMasterData();
  }, []);

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        マスタ管理
      </Typography>

      <Grid container spacing={3}>
        {/* 配達スタッフ */}
        <Grid item xs={12} md={6}>
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
        </Grid>

        {/* メーカー */}
        <Grid item xs={12} md={6}>
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
        </Grid>
      </Grid>
    </Box>
  );
};

export default MasterManagement;