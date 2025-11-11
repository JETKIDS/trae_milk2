import React from 'react';
import { Box, Card, CardContent, Typography, IconButton, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Alert } from '@mui/material';
import { ArrowBack as ArrowBackIcon, ArrowForward as ArrowForwardIcon } from '@mui/icons-material';
import moment from 'moment';

interface MonthDay {
  date: string;
  day: number;
  dayOfWeek: number;
  isToday?: boolean;
}

interface ProductCalendarData {
  productName: string;
  specification: string;
  dailyQuantities: { [date: string]: number };
}

interface TemporaryChange {
  id?: number;
  customer_id: number;
  change_date: string;
  change_type: 'skip' | 'add' | 'modify';
  product_id?: number;
}

interface DeliveryPattern {
  id?: number;
  customer_id: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  delivery_days: number[] | string;
  daily_quantities?: { [dayOfWeek: number]: number } | string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

type GetProductIdByName = (productName: string) => number | null;

interface Props {
  isStandalone: boolean;
  dayNames: string[];
  currentDate: moment.Moment;
  firstHalfDays: MonthDay[];
  secondHalfDays: MonthDay[];
  productCalendarData: ProductCalendarData[];
  temporaryChanges: TemporaryChange[] | null | undefined;
  patterns: DeliveryPattern[];
  getProductIdByName: GetProductIdByName;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  onCellClick: (event: React.MouseEvent<HTMLElement>, productName: string, date: string, quantity?: number) => void;
  invoiceConfirmed: boolean;
  invoiceConfirmedAt?: string | null;
}

export const CustomerCalendarPanel: React.FC<Props> = ({
  isStandalone,
  dayNames,
  currentDate,
  firstHalfDays,
  secondHalfDays,
  productCalendarData,
  temporaryChanges,
  patterns,
  getProductIdByName,
  handlePrevMonth,
  handleNextMonth,
  onCellClick,
  invoiceConfirmed,
  invoiceConfirmedAt,
}) => {
  const renderCalendarTable = (days: MonthDay[], title: string) => (
    <Box sx={{ mb: isStandalone ? 1 : 3 }}>
      <Typography variant={isStandalone ? 'subtitle2' : 'h6'} sx={{ mb: isStandalone ? 0.5 : 1, color: '#666' }}>{title}</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  backgroundColor: '#f5f5f5',
                  fontWeight: 'bold',
                  width: isStandalone ? 220 : 250,
                  minWidth: isStandalone ? 220 : 250,
                }}
              >
                商品名
              </TableCell>
              {days.map((day) => (
                <TableCell
                  key={day.date}
                  align="center"
                  sx={{
                    backgroundColor: day.dayOfWeek === 0 ? '#ffe6e6' : day.dayOfWeek === 6 ? '#e6f3ff' : '#ffffff',
                    fontWeight: 'bold',
                    minWidth: isStandalone ? 28 : 30,
                    maxWidth: isStandalone ? 28 : 30,
                    fontSize: isStandalone ? '11px' : '12px',
                    padding: isStandalone ? '2px' : '4px',
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
                {(() => {
                  const isTemporaryProduct = /^（臨時）/.test(product.productName);
                  const nameCellBg = isTemporaryProduct ? '#e8f5e9' : '#f5f5f5';
                  return (
                    <TableCell
                      sx={{
                        backgroundColor: nameCellBg,
                        fontWeight: 'bold',
                        width: isStandalone ? 220 : 250,
                        minWidth: isStandalone ? 220 : 250,
                        height: isStandalone ? 34 : 40,
                        verticalAlign: 'middle',
                        padding: isStandalone ? '4px 8px' : '6px 12px',
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: isStandalone ? '13px' : '14px',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {product.productName}
                      </Typography>
                    </TableCell>
                  );
                })()}
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
                        minWidth: isStandalone ? 28 : 30,
                        maxWidth: isStandalone ? 28 : 30,
                        height: isStandalone ? 36 : 40,
                        padding: isStandalone ? '2px' : '2px',
                        cursor: 'pointer',
                        verticalAlign: 'middle',
                      }}
                      onClick={(e) => onCellClick(e, product.productName, day.date, quantity)}
                    >
                      {hasSkip ? (
                        <Typography variant="body2" sx={{ fontSize: '14px', fontWeight: 'bold', color: '#1976d2' }}>休</Typography>
                      ) : hasCancel ? (
                        <Typography variant="body2" sx={{ fontSize: '14px', fontWeight: 'bold', color: '#d32f2f' }}>解</Typography>
                      ) : (
                        quantity && (
                          <Typography variant="body2" sx={{ fontSize: '14px', fontWeight: 'bold', color: '#000000' }}>
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
      <CardContent sx={{ p: isStandalone ? 1 : undefined }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: isStandalone ? 1 : 2 }}>
          <Typography variant={isStandalone ? 'subtitle1' : 'h6'}>配達カレンダー</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: isStandalone ? 0.5 : 1 }}>
            <IconButton onClick={handlePrevMonth} size={isStandalone ? 'small' : undefined}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant={isStandalone ? 'subtitle1' : 'h6'} sx={{ minWidth: isStandalone ? 110 : 120, textAlign: 'center' }}>
              {currentDate.format('YYYY年M月')}
            </Typography>
            <IconButton onClick={handleNextMonth} size={isStandalone ? 'small' : undefined}>
              <ArrowForwardIcon />
            </IconButton>
          </Box>
        </Box>

        {invoiceConfirmed && (
          <Alert severity="info" sx={{ mb: isStandalone ? 1 : 2 }}>
            この月は確定済みのため編集できません
            {invoiceConfirmedAt ? `（${moment(invoiceConfirmedAt).format('YYYY/MM/DD HH:mm')} に確定）` : ''}
          </Alert>
        )}

        <Box>
          {renderCalendarTable(firstHalfDays, '前半（1日〜15日）')}
          {renderCalendarTable(secondHalfDays, '後半（16日〜月末）')}
        </Box>
      </CardContent>
    </Card>
  );
};

export default CustomerCalendarPanel;