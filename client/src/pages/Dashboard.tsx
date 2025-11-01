import React, { useState, useEffect } from 'react';
import { Typography, Grid, Card, CardContent, Box } from '@mui/material';
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

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalCustomers: 0,
    totalProducts: 0,
    totalCourses: 0,
    totalStaff: 0,
  });

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

    fetchStats();
  }, []);

  const statCards: StatCard[] = [
    { title: '総顧客数', value: stats.totalCustomers, color: '#1976d2' },
    { title: '商品数', value: stats.totalProducts, color: '#388e3c' },
    { title: 'コース数', value: stats.totalCourses, color: '#f57c00' },
    { title: 'スタッフ数', value: stats.totalStaff, color: '#7b1fa2' },
  ];

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
    </Box>
  );
};

export default Dashboard;