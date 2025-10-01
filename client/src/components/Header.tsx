import React from 'react';
import { AppBar, Toolbar, Typography, Box, Theme } from '@mui/material';

const Header: React.FC = () => {
  return (
    <AppBar position="fixed" sx={{ zIndex: (theme: Theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          牛乳配達管理システム
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ mr: 2 }}>
            店舗名: 金沢牛乳店
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;