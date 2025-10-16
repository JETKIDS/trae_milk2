import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        ページが見つかりません
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        指定したURLに対応するページは存在しません。メニューから操作を続けるか、ダッシュボードへ戻ってください。
      </Typography>
      <Button variant="contained" onClick={() => navigate('/')}>ダッシュボードへ戻る</Button>
    </Box>
  );
};

export default NotFound;