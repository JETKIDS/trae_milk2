import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, Toolbar } from '@mui/material';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CustomerList from './pages/CustomerList';
import CustomerDetail from './pages/CustomerDetail';
import DeliveryList from './pages/DeliveryList';
import ProductList from './pages/ProductList';
import CourseList from './pages/CourseList';
import MasterManagement from './pages/MasterManagement';
import BillingOperations from './pages/BillingOperations';
import DebitImport from './pages/DebitImport';
import BulkCollection from './pages/BulkCollection';
import InvoicePreview from './pages/InvoicePreview';
import InvoiceBatchPreview from './pages/InvoiceBatchPreview';
import NotFound from './pages/NotFound';
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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CompanyProvider>
        <Router>
          <Box sx={{ display: 'flex' }}>
            <Header />
            <Sidebar />
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                p: 0,
                pl: 0,
                ml: '240px', // サイドバー幅（Drawer 240px）に合わせる
              }}
            >
              {/* AppBar 分のオフセットを Toolbar で確保 */}
              <Toolbar />
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
              <Route path="/masters" element={<MasterManagement />} />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Box>
          </Box>
        </Router>
      </CompanyProvider>
    </ThemeProvider>
  );
}

export default App;