import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Inventory as InventoryIcon,
  Route as RouteIcon,
  Settings as SettingsIcon,
  LocalShipping as DeliveryIcon,
  RequestQuote as BillingIcon,
  Analytics as AnalyticsIcon,
  Transform as TransformIcon,
} from '@mui/icons-material';

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactElement;
  path: string;
}

const menuItems: MenuItem[] = [
  { text: 'ダッシュボード', icon: <DashboardIcon />, path: '/' },
  { text: '顧客管理', icon: <PeopleIcon />, path: '/customers' },
  { text: '配達帳票出力', icon: <DeliveryIcon />, path: '/delivery' },
  { text: '請求業務', icon: <BillingIcon />, path: '/billing' },
  { text: '商品管理', icon: <InventoryIcon />, path: '/products' },
  { text: 'コース管理', icon: <RouteIcon />, path: '/courses' },
  { text: '各種分析リスト', icon: <AnalyticsIcon />, path: '/analyses' },
  { text: '全体変更', icon: <TransformIcon />, path: '/bulk-update' },
  { text: 'マスタ管理', icon: <SettingsIcon />, path: '/masters' },
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
    >
      <Toolbar />
      <List>
        {menuItems.map((item: MenuItem) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;
