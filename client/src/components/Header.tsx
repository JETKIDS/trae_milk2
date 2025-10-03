import React from 'react';
import { AppBar, Toolbar, Typography, Box, Theme } from '@mui/material';
import { useCompany } from '../contexts/CompanyContext';

const Header: React.FC = () => {
  const { companyInfo } = useCompany();
  const companyName = companyInfo?.company_name || '金沢牛乳店';

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme: Theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          牛乳配達管理システム
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ mr: 2 }}>
            店舗名: {companyName}
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;