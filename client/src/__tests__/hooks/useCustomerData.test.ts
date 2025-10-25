import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerData } from '../../hooks/useCustomerData';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('useCustomerData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('顧客データが正常に取得される', async () => {
    const mockData = {
      customer: {
        id: 1,
        custom_id: 'C001',
        customer_name: 'テスト顧客',
        address: 'テスト住所',
        phone: '090-1234-5678',
        course_id: 1,
        course_name: 'テストコース',
        contract_start_date: '2024-01-01'
      },
      patterns: []
    };

    mockedAxios.get.mockResolvedValueOnce({ data: mockData });

    const { result } = renderHook(() => useCustomerData('1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.customer).toEqual(mockData.customer);
    expect(result.current.patterns).toEqual(mockData.patterns);
    expect(result.current.error).toBeNull();
  });

  it('エラー時にエラーメッセージが設定される', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('ネットワークエラー'));

    const { result } = renderHook(() => useCustomerData('1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.customer).toBeNull();
    expect(result.current.error).toBe('ネットワークエラー');
  });

  it('顧客IDが未指定の場合エラーになる', () => {
    const { result } = renderHook(() => useCustomerData(undefined));

    expect(result.current.error).toBe('顧客IDが指定されていません');
    expect(result.current.loading).toBe(false);
  });
});
