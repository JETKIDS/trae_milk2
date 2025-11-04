import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, Toolbar } from '@mui/material';
import ErrorBoundary from './components/ErrorBoundary';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
const Dashboard = lazy(() => import('./pages/Dashboard'));
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
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  const isStandalone = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'standalone';
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
                }}
              >
                { !isStandalone && <Toolbar /> }
                <Suspense fallback={<div style={{ padding: 16 }}>読み込み中...</div>}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
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