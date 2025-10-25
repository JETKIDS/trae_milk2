import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CustomerCalendar from '../../components/CustomerCalendar';
import moment from 'moment';

const theme = createTheme();

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('CustomerCalendar', () => {
  const mockCalendar = [
    {
      date: '2024-01-01',
      day: 1,
      dayOfWeek: 1,
      isToday: false,
      products: [
        {
          productName: '牛乳',
          quantity: 1,
          unitPrice: 200,
          unit: '本',
          amount: 200
        }
      ]
    }
  ];

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

  const mockTemporaryChanges: any[] = [];

  const defaultProps = {
    calendar: mockCalendar,
    patterns: mockPatterns,
    temporaryChanges: mockTemporaryChanges,
    currentDate: moment('2024-01-15'),
    onPrevMonth: jest.fn(),
    onNextMonth: jest.fn(),
    onCellClick: jest.fn(),
    getProductIdByName: jest.fn(() => 1),
    invoiceConfirmed: false
  };

  it('カレンダーが正常に表示される', () => {
    renderWithProviders(<CustomerCalendar {...defaultProps} />);

    expect(screen.getByText('配達カレンダー')).toBeInTheDocument();
    expect(screen.getByText('2024年1月')).toBeInTheDocument();
    expect(screen.getByText('牛乳')).toBeInTheDocument();
  });

  it('月移動ボタンが正常に動作する', () => {
    renderWithProviders(<CustomerCalendar {...defaultProps} />);

    const prevButton = screen.getByLabelText('前の月');
    const nextButton = screen.getByLabelText('次の月');

    fireEvent.click(prevButton);
    expect(defaultProps.onPrevMonth).toHaveBeenCalled();

    fireEvent.click(nextButton);
    expect(defaultProps.onNextMonth).toHaveBeenCalled();
  });

  it('確定済みの場合は編集できない', () => {
    const props = { ...defaultProps, invoiceConfirmed: true };
    renderWithProviders(<CustomerCalendar {...props} />);

    expect(screen.getByText('この月は確定済みのため編集できません')).toBeInTheDocument();
  });

  it('セルクリック時にコールバックが呼ばれる', () => {
    renderWithProviders(<CustomerCalendar {...defaultProps} />);

    const cell = screen.getByText('1');
    fireEvent.click(cell);

    expect(defaultProps.onCellClick).toHaveBeenCalledWith(
      expect.any(Object),
      '牛乳',
      '2024-01-01',
      1
    );
  });
});
