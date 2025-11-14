import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, Toolbar, IconButton, Badge, Tooltip } from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import apiClient from './utils/apiClient';
import ErrorBoundary from './components/ErrorBoundary';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TasksManagement = lazy(() => import('./pages/TasksManagement'));
const CustomerList = lazy(() => import('./pages/CustomerList'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const DeliveryList = lazy(() => import('./pages/DeliveryList'));
const ProductList = lazy(() => import('./pages/ProductList'));
const CourseList = lazy(() => import('./pages/CourseList'));
const MasterManagement = lazy(() => import('./pages/MasterManagement'));
const BillingOperations = lazy(() => import('./pages/BillingOperations'));
const DebitImport = lazy(() => import('./pages/DebitImport'));
const BulkCollection = lazy(() => import('./pages/BulkCollection'));
const BulkUpdate = lazy(() => import('./pages/BulkUpdate'));
const Analyses = lazy(() => import('./pages/Analyses'));
const InvoicePreview = lazy(() => import('./pages/InvoicePreview'));
const InvoiceBatchPreview = lazy(() => import('./pages/InvoiceBatchPreview'));
const NotFound = lazy(() => import('./pages/NotFound'));
import { CompanyProvider } from './contexts/CompanyContext';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#39FF14',
      light: '#84FF6F',
      dark: '#24B10C',
      contrastText: '#0C2600',
    },
    secondary: {
      main: '#FFB5F2',
      light: '#FFD5F8',
      dark: '#E380C8',
      contrastText: '#4B1E3A',
    },
    background: {
      default: '#F6FFF1',
      paper: '#FFFFFF',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Fredoka", "Rounded Mplus 1c", "Helvetica", sans-serif',
    button: {
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: '0.015em',
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 14,
          padding: '9px 18px',
          transition: 'all 0.18s ease-in-out',
          boxShadow: '0 3px 8px rgba(57, 255, 20, 0.22)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 18px rgba(57, 255, 20, 0.35)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #39FF14 0%, #72FF57 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #31E20F 0%, #62F348 100%)',
          },
        },
        outlinedPrimary: {
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
            backgroundColor: 'rgba(57, 255, 20, 0.12)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 6px 20px rgba(57, 255, 20, 0.18)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          background: 'linear-gradient(135deg, #39FF14 0%, #24B10C 100%)',
        },
      },
    },
  },
});

function App() {
  const isStandalone = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'standalone';
  const [notif, setNotif] = useState({ daily: 0, monthlyToday: 0 });
  useEffect(() => {
    let mounted = true;
    const fetchCounts = async () => {
      try {
        const res = await apiClient.get('/api/tasks/incomplete-summary');
        if (!mounted) return;
        setNotif({ daily: res.data?.dailyIncomplete || 0, monthlyToday: res.data?.monthlyIncompleteToday || 0 });
      } catch {}
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CompanyProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ErrorBoundary>
            <Box sx={{ display: 'flex' }}>
              { !isStandalone && <Header /> }
              { !isStandalone && <Sidebar /> }
              <Box
                component="main"
                sx={{
                  flexGrow: 1,
                  p: 0,
                  pl: 0,
                  ml: isStandalone ? 0 : '240px',
                  backgroundColor: theme.palette.background.default,
                  minHeight: '100vh',
                }}
              >
                { !isStandalone && <Toolbar /> }
                <Box sx={{ position: 'fixed', top: 12, right: 16, zIndex: 1300 }}>
                  <Tooltip title={`未完 日:${notif.daily} 件 / 月(当日):${notif.monthlyToday} 件`}>
                    <IconButton color="primary" onClick={() => { window.location.href = '/tasks'; }}>
                      <Badge color="error" badgeContent={(notif.daily + notif.monthlyToday) || 0}>
                        <NotificationsNoneIcon />
                      </Badge>
                    </IconButton>
                  </Tooltip>
                </Box>
                <Suspense fallback={<div style={{ padding: 16 }}>読み込み中...</div>}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/tasks" element={<TasksManagement />} />
                    <Route path="/customers" element={<CustomerList />} />
                    <Route path="/customers/:id" element={<CustomerDetail />} />
                    <Route path="/invoice-preview/:id" element={<InvoicePreview />} />
                    <Route path="/invoice-preview/batch" element={<InvoiceBatchPreview />} />
                    <Route path="/collections/bulk" element={<BulkCollection />} />
                    <Route path="/debits/import" element={<DebitImport />} />
                    <Route path="/delivery" element={<DeliveryList />} />
                    <Route path="/billing" element={<BillingOperations />} />
                    <Route path="/billing/invoices" element={<Navigate to="/billing?tab=invoices" replace />} />
                    <Route path="/monthly" element={<Navigate to="/billing?tab=monthly" replace />} />
                    <Route path="/products" element={<ProductList />} />
                    <Route path="/courses" element={<CourseList />} />
                    <Route path="/bulk-update" element={<BulkUpdate />} />
                    <Route path="/analyses" element={<Analyses />} />
                    <Route path="/masters" element={<MasterManagement />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </Box>
            </Box>
          </ErrorBoundary>
        </Router>
      </CompanyProvider>
    </ThemeProvider>
  );
}

export default App;
