import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Card,
  CardContent,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, ArrowForward as ArrowForwardIcon } from '@mui/icons-material';
import moment from 'moment';
import { CalendarDay, MonthDay, ProductCalendarData, DeliveryPattern, TemporaryChange } from '../types/customerDetail';

interface CustomerCalendarProps {
  calendar: CalendarDay[];
  patterns: DeliveryPattern[];
  temporaryChanges: TemporaryChange[];
  currentDate: moment.Moment;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onCellClick: (event: React.MouseEvent<HTMLElement>, productName: string, date: string, quantity?: number) => void;
  getProductIdByName: (productName: string) => number | null;
  invoiceConfirmed: boolean;
}

const CustomerCalendar: React.FC<CustomerCalendarProps> = ({
  calendar,
  patterns,
  temporaryChanges,
  currentDate,
  onPrevMonth,
  onNextMonth,
  onCellClick,
  getProductIdByName,
  invoiceConfirmed
}) => {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  // 商品別カレンダーデータを生成
  const generateProductCalendarData = (): ProductCalendarData[] => {
    const productMap: { [key: string]: ProductCalendarData } = {};
    const monthStart = currentDate.clone().startOf('month');
    const monthEnd = currentDate.clone().endOf('month');

    // 当月に有効期間が重なる定期パターンの商品を初期化
    const overlappedPatternProductNames = new Set<string>();
    patterns.forEach(pattern => {
      const startsBeforeOrOnMonthEnd = moment(pattern.start_date).isSameOrBefore(monthEnd, 'day');
      const endsOnOrAfterMonthStart = !pattern.end_date || moment(pattern.end_date).isSameOrAfter(monthStart, 'day');
      if (startsBeforeOrOnMonthEnd && endsOnOrAfterMonthStart && pattern.product_name) {
        overlappedPatternProductNames.add(pattern.product_name);
      }
    });

    // カレンダーデータ（当月の実際の配達）から商品を初期化
    const deliveredProductNames = new Set<string>();
    calendar.forEach(day => {
      day.products.forEach(p => {
        deliveredProductNames.add(p.productName);
      });
    });

    // 表示対象商品は「当月に定期パターンが重なる商品」または「当月に実配達が発生した商品」の和集合
    const visibleProductNames = new Set<string>();
    overlappedPatternProductNames.forEach((n) => visibleProductNames.add(n));
    deliveredProductNames.forEach((n) => visibleProductNames.add(n));

    // 初期化
    visibleProductNames.forEach(name => {
      const anyUnit = (() => {
        for (let i = 0; i < calendar.length; i++) {
          const day = calendar[i];
          const found = day.products.find(p => p.productName === name);
          if (found) return found.unit || '';
        }
        const pat = patterns.find(p => p.product_name === name);
        return (pat?.unit) || '';
      })();

      productMap[name] = {
        productName: name,
        specification: anyUnit,
        dailyQuantities: {}
      };
    });

    // 当月の配達数量を設定
    calendar.forEach(day => {
      day.products.forEach(product => {
        if (!productMap[product.productName]) {
          productMap[product.productName] = {
            productName: product.productName,
            specification: product.unit || '',
            dailyQuantities: {}
          };
        }
        productMap[product.productName].dailyQuantities[day.date] = product.quantity;
      });
    });

    return Object.values(productMap);
  };

  // 月の日付配列を生成（前半・後半に分割）
  const generateMonthDays = (): { firstHalf: MonthDay[], secondHalf: MonthDay[] } => {
    const startOfMonth = currentDate.clone().startOf('month');
    const endOfMonth = currentDate.clone().endOf('month');
    const firstHalf: MonthDay[] = [];
    const secondHalf: MonthDay[] = [];
    
    for (let date = startOfMonth.clone(); date.isSameOrBefore(endOfMonth); date.add(1, 'day')) {
      const dayData = {
        date: date.format('YYYY-MM-DD'),
        day: date.date(),
        dayOfWeek: date.day(),
        isToday: date.isSame(moment(), 'day')
      };
      
      if (date.date() <= 15) {
        firstHalf.push(dayData);
      } else {
        secondHalf.push(dayData);
      }
    }
    
    return { firstHalf, secondHalf };
  };

  const productCalendarData = useMemo(() => generateProductCalendarData(), [calendar, patterns, currentDate]);
  const { firstHalf, secondHalf } = useMemo(() => generateMonthDays(), [currentDate]);

  const renderCalendarTable = (days: MonthDay[], title: string) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 1, color: '#666' }}>{title}</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell 
                sx={{ 
                  backgroundColor: '#f5f5f5',
                  fontWeight: 'bold',
                  width: 250,
                  minWidth: 250
                }}
              >
                商品名
              </TableCell>
              {days.map((day) => (
                <TableCell 
                  key={day.date}
                  align="center" 
                  sx={{ 
                    backgroundColor: day.dayOfWeek === 0 ? '#ffe6e6' : 
                                    day.dayOfWeek === 6 ? '#e6f3ff' : '#ffffff',
                    fontWeight: 'bold',
                    minWidth: 30,
                    maxWidth: 30,
                    fontSize: '12px',
                    padding: '4px'
                  }}
                >
                  <Box>
                    <Typography variant="caption" display="block" sx={{ fontSize: '10px' }}>
                      {day.day}
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ fontSize: '9px' }}>
                      {dayNames[day.dayOfWeek]}
                    </Typography>
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {productCalendarData.map((product, productIndex) => (
              <TableRow key={productIndex}>
                <TableCell 
                  sx={{ 
                    backgroundColor: /^（臨時）/.test(product.productName) ? '#e8f5e9' : '#f5f5f5',
                    fontWeight: 'bold',
                    width: 250,
                    minWidth: 250,
                    height: 40,
                    verticalAlign: 'middle',
                    padding: '6px 12px'
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontSize: '14px', 
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {product.productName}
                  </Typography>
                </TableCell>
                {days.map((day) => {
                  const isTemporaryProduct = /^（臨時）/.test(product.productName);
                  const quantity = product.dailyQuantities[day.date];
                  const pid = getProductIdByName(product.productName);
                  const hasSkip = (() => {
                    if (!pid || !temporaryChanges) return false;
                    return temporaryChanges.some(tc => tc.change_type === 'skip' && tc.product_id === pid && tc.change_date === day.date);
                  })();
                  const hasModify = (() => {
                    if (!pid || !temporaryChanges) return false;
                    return temporaryChanges.some(tc => tc.change_type === 'modify' && tc.product_id === pid && tc.change_date === day.date);
                  })();
                  const hasCancel = (() => {
                    if (!pid || !patterns) return false;
                    const endsPrevDay = patterns.some(p =>
                      p.product_id === pid && p.is_active && !!p.end_date &&
                      moment(p.end_date).add(1, 'day').format('YYYY-MM-DD') === day.date
                    );
                    if (!endsPrevDay) return false;
                    const restartsToday = patterns.some(p =>
                      p.product_id === pid && p.is_active &&
                      moment(p.start_date).format('YYYY-MM-DD') === day.date
                    );
                    return endsPrevDay && !restartsToday;
                  })();
                  const baseBgColor = day.isToday ? '#fff3e0' : (day.dayOfWeek === 0 ? '#ffe6e6' : (day.dayOfWeek === 6 ? '#e6f3ff' : '#ffffff'));
                  let cellBgColor = (!hasSkip && hasModify) ? '#fffde7' : baseBgColor;
                  if (isTemporaryProduct) {
                    cellBgColor = '#e8f5e9';
                  }
                  return (
                    <TableCell 
                      key={day.date}
                      align="center"
                      sx={{ 
                        backgroundColor: cellBgColor,
                        border: day.isToday ? '2px solid #ff9800' : '1px solid #e0e0e0',
                        minWidth: 30,
                        maxWidth: 30,
                        height: 40,
                        padding: '2px',
                        cursor: invoiceConfirmed ? 'default' : 'pointer',
                        verticalAlign: 'middle'
                      }}
                      onClick={invoiceConfirmed ? undefined : (e) => onCellClick(e, product.productName, day.date, quantity)}
                    >
                      {hasSkip ? (
                        <Typography 
                          variant="body2" 
                          sx={{ fontSize: '14px', fontWeight: 'bold', color: '#1976d2' }}
                        >
                          休
                        </Typography>
                      ) : hasCancel ? (
                        <Typography 
                          variant="body2" 
                          sx={{ fontSize: '14px', fontWeight: 'bold', color: '#d32f2f' }}
                        >
                          解
                        </Typography>
                      ) : (
                        quantity && (
                          <Typography 
                            variant="body2" 
                            sx={{ fontSize: '14px', fontWeight: 'bold', color: '#000000' }}
                          >
                            {quantity}
                          </Typography>
                        )
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            配達カレンダー
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={onPrevMonth}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ minWidth: 120, textAlign: 'center' }}>
              {currentDate.format('YYYY年M月')}
            </Typography>
            <IconButton onClick={onNextMonth}>
              <ArrowForwardIcon />
            </IconButton>
          </Box>
        </Box>

        {invoiceConfirmed && (
          <Box sx={{ mb: 2, p: 1, bgcolor: '#ffcdd2', borderRadius: 1 }}>
            <Typography variant="body2" color="error">
              この月は確定済みのため編集できません
            </Typography>
          </Box>
        )}
        
        {renderCalendarTable(firstHalf, '前半（1日〜15日）')}
        {renderCalendarTable(secondHalf, '後半（16日〜月末）')}
      </CardContent>
    </Card>
  );
};

export default CustomerCalendar;
