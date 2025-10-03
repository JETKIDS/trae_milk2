import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';
import DeliveryPatternManager from '../components/DeliveryPatternManager';
import TemporaryChangeManager from '../components/TemporaryChangeManager';
import CustomerForm from '../components/CustomerForm';

interface Customer {
  id: number;
  custom_id?: string;
  customer_name: string;
  yomi?: string;
  address: string;
  phone: string;
  email?: string;
  course_id: number;
  staff_id?: number;
  course_name: string;
  staff_name: string;
  contract_start_date: string;
  notes?: string;
  delivery_order?: number;
}

interface DeliveryPattern {
  id?: number;
  customer_id: number;
  product_id: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity: number; // 後方互換性のため残す
  unit_price: number;
  delivery_days: number[];
  daily_quantities?: { [dayOfWeek: number]: number }; // 曜日ごとの数量 (0=日曜, 1=月曜, ...)
  start_date: string;
  end_date?: string;
  is_active: boolean;
}

interface TemporaryChange {
  id?: number;
  customer_id: number;
  change_date: string;
  change_type: 'skip' | 'add' | 'modify';
  product_id?: number;
  product_name?: string;
  manufacturer_name?: string;
  unit?: string;
  quantity?: number;
  unit_price?: number;
  reason?: string;
  created_at?: string;
}

interface CalendarDay {
  date: string;
  day: number;
  dayOfWeek: number;
  products: {
    productName: string;
    quantity: number;
    unitPrice: number;
    unit: string;
    amount: number;
  }[];
}

interface ProductCalendarData {
  productName: string;
  specification: string;
  dailyQuantities: { [date: string]: number };
}

interface MonthDay {
  date: string;
  day: number;
  dayOfWeek: number;
  isToday: boolean;
}

const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [patterns, setPatterns] = useState<DeliveryPattern[]>([]);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [currentDate, setCurrentDate] = useState(moment());
  const [loading, setLoading] = useState(true);
  const [temporaryChanges, setTemporaryChanges] = useState<TemporaryChange[]>([]);
  const [openEditForm, setOpenEditForm] = useState(false);

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  const fetchCustomerData = useCallback(async () => {
    try {
      const response = await axios.get(`/api/customers/${id}`);
      setCustomer(response.data.customer);
      setPatterns(response.data.patterns);
    } catch (error) {
      console.error('顧客データの取得に失敗しました:', error);
    }
  }, [id]);

  const fetchCalendarData = useCallback(async () => {
    try {
      const year = currentDate.year();
      const month = currentDate.month() + 1;
      const response = await axios.get(`/api/customers/${id}/calendar/${year}/${month}`);
      setCalendar(response.data.calendar);
      setTemporaryChanges(response.data.temporaryChanges);
    } catch (error) {
      console.error('カレンダーデータの取得に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  }, [id, currentDate]);

  useEffect(() => {
    if (id) {
      fetchCustomerData();
      fetchCalendarData();
    }
  }, [id, currentDate, fetchCustomerData, fetchCalendarData]);

  const handlePatternsChange = () => {
    fetchCustomerData(); // 配達パターンが変更されたらカレンダーデータも更新
    fetchCalendarData();
  };

  const handleTemporaryChangesUpdate = () => {
    fetchCalendarData(); // 臨時変更が更新されたらカレンダーデータを更新
  };

  const handleOpenEditForm = () => {
    setOpenEditForm(true);
  };

  const handleCloseEditForm = () => {
    setOpenEditForm(false);
  };

  const handleCustomerUpdated = () => {
    fetchCustomerData(); // 顧客データを再取得
    setOpenEditForm(false);
  };

  const handlePrevMonth = () => {
    setCurrentDate(currentDate.clone().subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentDate(currentDate.clone().add(1, 'month'));
  };

  const calculateDayTotal = (day: CalendarDay): number => {
    return day.products.reduce((total: number, product: any) => total + product.amount, 0);
  };

  const calculateMonthlyTotal = (): number => {
    let total = 0;
    
    // カレンダーデータから通常の配達金額を集計
    total += calendar.reduce((sum: number, day: CalendarDay) => sum + calculateDayTotal(day), 0);
    
    // 臨時配達データも合計に追加（temporaryChangesが存在する場合のみ）
    if (temporaryChanges) {
      temporaryChanges.forEach(change => {
        if (change.change_type === 'add' && change.quantity && change.unit_price) {
          const changeMonth = moment(change.change_date);
          // 現在表示中の月の範囲内かチェック
          if (changeMonth.year() === currentDate.year() && changeMonth.month() === currentDate.month()) {
            total += change.quantity * change.unit_price;
          }
        }
      });
    }
    
    return total;
  };

  const calculateMonthlyQuantity = (): { [key: string]: number } => {
    const quantities: { [key: string]: number } = {};
    
    // カレンダーデータから通常の配達数量を集計
    calendar.forEach((day: CalendarDay) => {
      day.products.forEach((product: any) => {
        if (!quantities[product.productName]) {
          quantities[product.productName] = 0;
        }
        quantities[product.productName] += product.quantity;
      });
    });

    // 臨時配達データも集計に追加（temporaryChangesが存在する場合のみ）
    if (temporaryChanges) {
      temporaryChanges.forEach(change => {
        if (change.change_type === 'add' && change.product_name && change.quantity) {
          const changeMonth = moment(change.change_date);
          // 現在表示中の月の範囲内かチェック
          if (changeMonth.year() === currentDate.year() && changeMonth.month() === currentDate.month()) {
            const tempProductName = `（臨時）${change.product_name}`;
            if (!quantities[tempProductName]) {
              quantities[tempProductName] = 0;
            }
            quantities[tempProductName] += change.quantity;
          }
        }
      });
    }

    return quantities;
  };

  // 商品別カレンダーデータを生成
  const generateProductCalendarData = (): ProductCalendarData[] => {
    const productMap: { [key: string]: ProductCalendarData } = {};
    
    // 全ての商品を初期化（通常の配達パターンから）
    patterns.forEach(pattern => {
      if (pattern.product_name) {
        productMap[pattern.product_name] = {
          productName: pattern.product_name,
          specification: `${pattern.unit || ''}`,
          dailyQuantities: {}
        };
      }
    });

    // カレンダーデータから商品別の数量を設定（通常配達と臨時配達の両方）
    calendar.forEach(day => {
      day.products.forEach(product => {
        // 商品が存在しない場合は初期化
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

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  if (!customer) {
    return <Typography>顧客が見つかりません。</Typography>;
  }

  const monthlyQuantities = calculateMonthlyQuantity();
  const monthlyTotal = calculateMonthlyTotal();

  return (
    <Box>
      {/* 顧客基本情報 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5" component="h1">
              {customer.customer_name} 様
              {customer.yomi ? (
                <Typography variant="body2" component="span" sx={{ ml: 2, color: 'text.secondary' }}>
                  （{customer.yomi}）
                </Typography>
              ) : null}
            </Typography>
            <Button startIcon={<EditIcon />} variant="outlined" onClick={handleOpenEditForm}>
              編集
            </Button>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">住所</Typography>
              <Typography variant="body1">{customer.address}</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="textSecondary">電話番号</Typography>
              <Typography variant="body1">{customer.phone}</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="textSecondary">配達コース</Typography>
              <Chip label={customer.course_name} color="primary" size="small" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 月次カレンダー */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              配達カレンダー
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={handlePrevMonth}>
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h6" sx={{ minWidth: 120, textAlign: 'center' }}>
                {currentDate.format('YYYY年M月')}
              </Typography>
              <IconButton onClick={handleNextMonth}>
                <ArrowForwardIcon />
              </IconButton>
            </Box>
          </Box>

          {/* 商品別カレンダー */}
          {(() => {
            const { firstHalf, secondHalf } = generateMonthDays();
            
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
                      {generateProductCalendarData().map((product, productIndex) => (
                        <TableRow key={productIndex}>
                          <TableCell 
                             sx={{ 
                               backgroundColor: '#f5f5f5',
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
                            const quantity = product.dailyQuantities[day.date];
                            return (
                              <TableCell 
                                 key={day.date}
                                 align="center"
                                 sx={{ 
                                   backgroundColor: day.isToday ? '#fff3e0' :
                                                  day.dayOfWeek === 0 ? '#ffe6e6' : 
                                                  day.dayOfWeek === 6 ? '#e6f3ff' : '#ffffff',
                                   border: day.isToday ? '2px solid #ff9800' : '1px solid #e0e0e0',
                                   minWidth: 30,
                                   maxWidth: 30,
                                   height: 40,
                                   padding: '2px',
                                   cursor: quantity ? 'pointer' : 'default',
                                   verticalAlign: 'middle'
                                 }}
                                 onClick={() => quantity && console.log(`編集: ${product.productName} - ${day.date} - ${quantity}`)}
                               >
                                {quantity && (
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontSize: '14px', 
                                      fontWeight: 'bold',
                                      color: '#000000'
                                    }}
                                  >
                                    {quantity}
                                  </Typography>
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
              <Box>
                {renderCalendarTable(firstHalf, '前半（1日〜15日）')}
                {renderCalendarTable(secondHalf, '後半（16日〜月末）')}
              </Box>
            );
          })()}

          {/* 月次集計 */}
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                <Typography variant="h6" gutterBottom>月次集計</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>商品名</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell align="right">単価</TableCell>
                        <TableCell align="right">金額</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(monthlyQuantities).map(([productName, quantity]) => {
                        let unitPrice = 0;
                        let amount = 0;

                        if (productName.startsWith('（臨時）')) {
                          // 臨時配達の場合、temporaryChangesから単価を取得
                          const originalProductName = productName.replace('（臨時）', '');
                          const tempChange = temporaryChanges.find(change => 
                            change.product_name === originalProductName && 
                            change.change_type === 'add' &&
                            change.unit_price
                          );
                          unitPrice = tempChange?.unit_price || 0;
                        } else {
                          // 通常配達の場合、patternsから単価を取得
                          const pattern = patterns.find(p => p.product_name === productName);
                          unitPrice = pattern?.unit_price || 0;
                        }

                        amount = quantity * unitPrice;

                        return (
                          <TableRow key={productName}>
                            <TableCell>{productName}</TableCell>
                            <TableCell align="right">{quantity}</TableCell>
                            <TableCell align="right">¥{unitPrice.toLocaleString()}</TableCell>
                            <TableCell align="right">¥{amount.toLocaleString()}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ backgroundColor: '#e3f2fd' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      月次合計
                    </Typography>
                    <Typography variant="h4" color="primary" fontWeight="bold">
                      ¥{monthlyTotal.toLocaleString()}
                    </Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                      {currentDate.format('YYYY年M月')}分
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      {/* 配達パターン設定 */}
      <DeliveryPatternManager
        customerId={Number(id)}
        patterns={patterns}
        onPatternsChange={handlePatternsChange}
        onTemporaryChangesUpdate={handleTemporaryChangesUpdate}
      />

      {/* 臨時変更管理 */}
      <TemporaryChangeManager
        customerId={Number(id)}
        changes={temporaryChanges}
        onChangesUpdate={handleTemporaryChangesUpdate}
      />

      {/* 顧客編集フォーム */}
      {customer && (
        <CustomerForm
          open={openEditForm}
          onClose={handleCloseEditForm}
          onSave={handleCustomerUpdated}
          isEdit={true}
          customer={customer}
        />
      )}
    </Box>
  );
};

export default CustomerDetail;