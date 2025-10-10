import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';

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
import InvoicePreview from './pages/InvoicePreview';
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
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Box sx={{ display: 'flex' }}>
            <Header />
            <Sidebar />
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                p: 0,
                pl: 0, // コンテンツの内側余白はゼロに戻す
                mt: 8, // ヘッダーの高さ分のマージン
                ml: '40px', // サイドバー幅に合わせず、左マージンを40pxに設定
              }}
            >
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/customers" element={<CustomerList />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/invoice-preview/:id" element={<InvoicePreview />} />
                <Route path="/delivery" element={<DeliveryList />} />
                <Route path="/billing" element={<BillingOperations />} />
                <Route path="/products" element={<ProductList />} />
                <Route path="/courses" element={<CourseList />} />
              <Route path="/masters" element={<MasterManagement />} />
              </Routes>
            </Box>
          </Box>
        </Router>
      </CompanyProvider>
    </ThemeProvider>
  );
}

export default App;