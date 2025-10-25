import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CustomerDetail from '../pages/CustomerDetail';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock moment
jest.mock('moment', () => {
  const actualMoment = jest.requireActual('moment');
  return {
    ...actualMoment,
    default: (date?: any) => {
      if (date) return actualMoment(date);
      return actualMoment('2024-01-15'); // 固定日付でテスト
    }
  };
});

const theme = createTheme();

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </ThemeProvider>
  );
};

describe('CustomerDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('顧客データが正常に読み込まれる', async () => {
    const mockCustomer = {
      id: 1,
      custom_id: 'C001',
      customer_name: 'テスト顧客',
      address: 'テスト住所',
      phone: '090-1234-5678',
      course_id: 1,
      course_name: 'テストコース',
      contract_start_date: '2024-01-01'
    };

    const mockPatterns = [
      {
        id: 1,
        customer_id: 1,
        product_id: 1,
        product_name: '牛乳',
        quantity: 1,
        unit_price: 200,
        delivery_days: [1, 3, 5],
        start_date: '2024-01-01',
        is_active: true
      }
    ];

    mockedAxios.get.mockResolvedValueOnce({
      data: { customer: mockCustomer, patterns: mockPatterns }
    });

    renderWithProviders(<CustomerDetail />);

    await waitFor(() => {
      expect(screen.getByText('テスト顧客')).toBeInTheDocument();
    });
  });

  it('エラー時にエラーメッセージが表示される', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('ネットワークエラー'));

    renderWithProviders(<CustomerDetail />);

    await waitFor(() => {
      expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
    });
  });

  it('月次請求確定ボタンが正常に動作する', async () => {
    const mockCustomer = {
      id: 1,
      custom_id: 'C001',
      customer_name: 'テスト顧客',
      address: 'テスト住所',
      phone: '090-1234-5678',
      course_id: 1,
      course_name: 'テストコース',
      contract_start_date: '2024-01-01'
    };

    mockedAxios.get.mockResolvedValueOnce({
      data: { customer: mockCustomer, patterns: [] }
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: { success: true }
    });

    renderWithProviders(<CustomerDetail />);

    await waitFor(() => {
      expect(screen.getByText('テスト顧客')).toBeInTheDocument();
    });

    const confirmButton = screen.getByText('月次請求確定');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/invoices/confirm'),
        expect.any(Object)
      );
    });
  });
});
