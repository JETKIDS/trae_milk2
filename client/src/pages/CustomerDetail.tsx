import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dialog,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Popover,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';
import DeliveryPatternManager, { DeliveryPatternManagerHandle } from '../components/DeliveryPatternManager';
import TemporaryChangeManager, { TemporaryChangeManagerHandle } from '../components/TemporaryChangeManager';
import CustomerForm from '../components/CustomerForm';
import CustomerActionsSidebar from '../components/CustomerActionsSidebar';

interface Customer {
  id: number;
  custom_id?: string;
  customer_name: string;
  yomi?: string;
  address: string;
  phone: string;
  email?: string;
  course_id: number;
  course_name: string;
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
  // 右側操作メニュー用のダイアログ状態
  const [openUnitPriceChange, setOpenUnitPriceChange] = useState(false);
  // 単価変更フォーム用の状態
  const [unitPriceChangeTargetId, setUnitPriceChangeTargetId] = useState<number | ''>('');
  const [unitPriceChangeNewPrice, setUnitPriceChangeNewPrice] = useState<number | ''>('');
  const [unitPriceChangeStartMonth, setUnitPriceChangeStartMonth] = useState<string>(moment().format('YYYY-MM'));
  const [unitPriceChangeSaving, setUnitPriceChangeSaving] = useState(false);
  const [openTemporaryQuantityChange, setOpenTemporaryQuantityChange] = useState(false);
  const [openSuspendProduct, setOpenSuspendProduct] = useState(false);
  const [openCancelProduct, setOpenCancelProduct] = useState(false);
  const [openBillingRounding, setOpenBillingRounding] = useState(false);

  // ダイアログをセルのポップオーバーから開くための参照
  const dpManagerRef = useRef<DeliveryPatternManagerHandle>(null);
  const tempChangeManagerRef = useRef<TemporaryChangeManagerHandle>(null);
  const [billingRoundingEnabled, setBillingRoundingEnabled] = useState(true); // デフォルトON
  const [billingMethod, setBillingMethod] = useState<'collection' | 'debit'>('collection');
  const [openBankInfo, setOpenBankInfo] = useState(false);

  // カレンダーセル編集用の状態
  const [cellMenuAnchor, setCellMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ date: string; productName: string; quantity?: number } | null>(null);
  const [openQuantityDialog, setOpenQuantityDialog] = useState(false);
  const [editQuantityValue, setEditQuantityValue] = useState<number | ''>('');

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  const fetchCustomerData = useCallback(async () => {
    try {
      const response = await axios.get(`/api/customers/${id}`);
      setCustomer(response.data.customer);
      setPatterns(response.data.patterns);
      // 顧客設定の反映（存在しない場合はデフォルト適用）
      const settings = response.data.settings;
      if (settings) {
        setBillingMethod(settings.billing_method === 'debit' ? 'debit' : 'collection');
        setBillingRoundingEnabled(settings.rounding_enabled === 1 || settings.rounding_enabled === true);
      } else {
        setBillingMethod('collection');
        setBillingRoundingEnabled(true);
      }
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

  // セルに紐づく商品IDから、指定日の有効な定期パターンを取得
  const findPatternForSelectedCell = (): DeliveryPattern | null => {
    if (!selectedCell) return null;
    const productId = getProductIdByName(selectedCell.productName);
    if (!productId) return null;
    const date = moment(selectedCell.date);
    const pattern = patterns.find(p =>
      p.product_id === productId && p.is_active &&
      date.isSameOrAfter(moment(p.start_date)) &&
      (!p.end_date || date.isSameOrBefore(moment(p.end_date)))
    );
    return pattern || null;
  };

  // 解約（この日以降）：選択日の前日で旧パターンを終了し、以後非表示にする
  const handleCancelFromSelectedDate = async () => {
    if (!selectedCell) return;
    const pattern = findPatternForSelectedCell();
    if (!pattern || !pattern.id) {
      alert('このセルに対応する定期パターンが見つかりません。');
      return;
    }
    // 確認ダイアログ
    const ok = window.confirm('この日以降の配達を解約します。過去分は残ります。よろしいですか？');
    if (!ok) return;
    const endDate = moment(selectedCell.date).subtract(1, 'day').format('YYYY-MM-DD');
    try {
      await axios.put(`/api/delivery-patterns/${pattern.id}`, {
        product_id: pattern.product_id,
        quantity: pattern.quantity,
        unit_price: pattern.unit_price,
        delivery_days: pattern.delivery_days,
        daily_quantities: pattern.daily_quantities || {},
        start_date: pattern.start_date,
        end_date: endDate,
        // is_active は保持（true のまま）して過去分を表示対象にする
        is_active: true,
      });
      closeCellMenu();
      // パターンとカレンダーの再取得
      await fetchCustomerData();
      await fetchCalendarData();
    } catch (error) {
      console.error('解約処理に失敗しました:', error);
      alert('解約処理に失敗しました。時間をおいて再度お試しください。');
    }
  };

  // パターン変更：既存の「配達パターン設定」ダイアログを開く
  const handleOpenPatternChange = () => {
    const pattern = findPatternForSelectedCell();
    if (!pattern) {
      alert('このセルに対応する定期パターンが見つかりません。');
      return;
    }
    closeCellMenu();
    dpManagerRef.current?.openForPattern(pattern);
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

  // 商品名から product_id を取得（臨時表示の接頭辞を除去して検索）
  const getProductIdByName = (productName: string): number | null => {
    const normalized = productName.replace(/^（臨時）/, '');
    const found = patterns.find(p => p.product_name === normalized);
    return found ? found.product_id : null;
  };

  // セルクリック時のポップオーバー表示
  const handleCellClick = (
    event: React.MouseEvent<HTMLElement>,
    productName: string,
    date: string,
    quantity?: number
  ) => {
    setSelectedCell({ productName, date, quantity });
    setCellMenuAnchor(event.currentTarget);
  };

  const closeCellMenu = () => {
    setCellMenuAnchor(null);
  };

  // 本数変更ダイアログを開く
  const openChangeQuantity = () => {
    if (!selectedCell) return;
    setEditQuantityValue(selectedCell.quantity ?? 0);
    setOpenQuantityDialog(true);
  };

  const closeChangeQuantity = () => {
    setOpenQuantityDialog(false);
    setEditQuantityValue('');
  };

  // 臨時変更API呼び出し（modify/skip/add）
  const postTemporaryChange = async (
    change_type: 'modify' | 'skip' | 'add',
    payload: { product_id: number | null; quantity?: number; unit_price?: number }
  ) => {
    if (!selectedCell) return;
    const product_id = payload.product_id ?? getProductIdByName(selectedCell.productName);
    if (!product_id) {
      console.error('商品IDが特定できません:', selectedCell.productName);
      return;
    }
    try {
      await axios.post('/api/temporary-changes', {
        customer_id: Number(id),
        change_date: selectedCell.date,
        change_type,
        product_id,
        quantity: payload.quantity ?? null,
        unit_price: payload.unit_price ?? null,
        reason: null,
      });
      closeCellMenu();
      closeChangeQuantity();
      fetchCalendarData();
    } catch (err) {
      console.error('臨時変更の保存に失敗しました:', err);
    }
  };

  // 本数変更の保存（当日の数量を上書き）
  const saveChangeQuantity = async () => {
    if (editQuantityValue === '' || Number(editQuantityValue) < 0) return;
    await postTemporaryChange('modify', { product_id: null, quantity: Number(editQuantityValue) });
  };

  // 休配（当日0本に上書き）
  const applySkipForDay = async () => {
    await postTemporaryChange('skip', { product_id: null, quantity: 0 });
  };

  const calculateDayTotal = (day: CalendarDay): number => {
    return day.products.reduce((total: number, product: any) => total + product.amount, 0);
  };

  const calculateMonthlyTotal = (): number => {
    let total = 0;
    
    // カレンダーデータから通常の配達金額を集計
    total += calendar.reduce((sum: number, day: CalendarDay) => sum + calculateDayTotal(day), 0);
    
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

    return quantities;
  };

  // 単価変更の保存
  const handleUnitPriceChangeSave = async () => {
    if (unitPriceChangeTargetId === '' || unitPriceChangeNewPrice === '' || !unitPriceChangeStartMonth) return;
    const target = patterns.find(p => p.id === unitPriceChangeTargetId);
    if (!target) return;
    try {
      setUnitPriceChangeSaving(true);
      const startDate = `${unitPriceChangeStartMonth}-01`;
      const oldEndDate = moment(startDate).subtract(1, 'day').format('YYYY-MM-DD');

      // delivery_days と daily_quantities は型に応じて1回だけJSON化
      const deliveryDaysStr = Array.isArray(target.delivery_days)
        ? JSON.stringify(target.delivery_days)
        : typeof target.delivery_days === 'string'
          ? target.delivery_days
          : '[]';

      const dailyQuantitiesStr = target.daily_quantities
        ? (typeof target.daily_quantities === 'string'
            ? target.daily_quantities
            : JSON.stringify(target.daily_quantities))
        : null;

      // 既存パターンの終了日を変更開始前日に更新（履歴として非アクティブ化）
      await axios.put(`/api/delivery-patterns/${unitPriceChangeTargetId}`, {
        product_id: target.product_id,
        quantity: target.quantity,
        unit_price: target.unit_price,
        delivery_days: deliveryDaysStr,
        daily_quantities: dailyQuantitiesStr,
        start_date: target.start_date,
        end_date: oldEndDate,
        is_active: 0,
      });

      // 新単価の新パターンを開始月1日で作成（終了日は無期限: null）
      await axios.post(`/api/delivery-patterns`, {
        customer_id: target.customer_id,
        product_id: target.product_id,
        quantity: target.quantity,
        unit_price: unitPriceChangeNewPrice,
        delivery_days: deliveryDaysStr,
        daily_quantities: dailyQuantitiesStr,
        start_date: startDate,
        end_date: null,
        is_active: 1,
      });

      // 画面を更新
      setOpenUnitPriceChange(false);
      setUnitPriceChangeTargetId('');
      setUnitPriceChangeNewPrice('');
      setUnitPriceChangeStartMonth(moment().format('YYYY-MM'));
      handlePatternsChange();
    } catch (err) {
      console.error('単価変更の保存に失敗しました:', err);
    } finally {
      setUnitPriceChangeSaving(false);
    }
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
  const monthlyTotalRaw = calculateMonthlyTotal();
  const monthlyTotal = billingRoundingEnabled
    ? Math.floor(monthlyTotalRaw / 10) * 10 // 1の位切り捨て
    : monthlyTotalRaw;

  // 設定保存ヘルパー
  const saveBillingSettings = async (method: 'collection' | 'debit', roundingEnabled: boolean) => {
    try {
      await axios.put(`/api/customers/${id}/settings`, {
        billing_method: method,
        rounding_enabled: roundingEnabled ? 1 : 0,
      });
    } catch (err) {
      console.error('請求設定の保存に失敗しました:', err);
    }
  };

  const handleToggleBillingRounding = async (checked: boolean) => {
    setBillingRoundingEnabled(checked);
    await saveBillingSettings(billingMethod, checked);
  };

  const handleChangeBillingMethod = async (method: 'collection' | 'debit') => {
    setBillingMethod(method);
    await saveBillingSettings(method, billingRoundingEnabled);
  };

  return (
    <Grid container spacing={2}>
      {/* 左：メインコンテンツ（少し狭く） */}
      <Grid item xs={12} md={9}>
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
                            const pid = getProductIdByName(product.productName);
                            const hasSkip = (() => {
                              if (!pid || !temporaryChanges) return false;
                              return temporaryChanges.some(tc => tc.change_type === 'skip' && tc.product_id === pid && tc.change_date === day.date);
                            })();
                            const hasModify = (() => {
                              if (!pid || !temporaryChanges) return false;
                              return temporaryChanges.some(tc => tc.change_type === 'modify' && tc.product_id === pid && tc.change_date === day.date);
                            })();
                            // 解約マーカー：前日が定期パターンの終了日（is_active=true）なら当日に赤い「解」を表示
                            const hasCancel = (() => {
                              if (!pid || !patterns) return false;
                              return patterns.some(p =>
                                p.product_id === pid && p.is_active && !!p.end_date &&
                                moment(p.end_date).add(1, 'day').format('YYYY-MM-DD') === day.date
                              );
                            })();
                            const baseBgColor = day.isToday ? '#fff3e0' : (day.dayOfWeek === 0 ? '#ffe6e6' : (day.dayOfWeek === 6 ? '#e6f3ff' : '#ffffff'));
                            const cellBgColor = (!hasSkip && hasModify) ? '#fffde7' : baseBgColor; // modify時は薄い黄色
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
                                    cursor: 'pointer',
                                    verticalAlign: 'middle'
                                  }}
                                  onClick={(e) => handleCellClick(e, product.productName, day.date, quantity)}
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
                        // 月内の金額はカレンダーの各日の amount を積み上げて算出（単価変更にも正確に対応）
                        let totalAmount = 0;
                        const priceSet = new Set<number>();
                        calendar.forEach((day) => {
                          day.products.forEach((p) => {
                            if (p.productName === productName) {
                              totalAmount += p.amount;
                              priceSet.add(p.unitPrice);
                            }
                          });
                        });

                        // 表示用単価：月内で単価が1種類ならその値、複数ある場合は「複数」表示
                        const unitPriceDisplay = priceSet.size === 1 ? Array.from(priceSet)[0] : null;

                        return (
                          <TableRow key={productName}>
                            <TableCell>{productName}</TableCell>
                            <TableCell align="right">{quantity}</TableCell>
                            <TableCell align="right">
                              {unitPriceDisplay !== null ? `¥${unitPriceDisplay.toLocaleString()}` : '複数'}
                            </TableCell>
                            <TableCell align="right">¥{totalAmount.toLocaleString()}</TableCell>
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
          ref={dpManagerRef}
          customerId={Number(id)}
          patterns={patterns}
          onPatternsChange={handlePatternsChange}
          onTemporaryChangesUpdate={handleTemporaryChangesUpdate}
        />

        {/* 臨時変更管理 */}
        <TemporaryChangeManager
          ref={tempChangeManagerRef}
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
      </Grid>

      {/* 右：操作メニュー（少し広く） */}
      <Grid item xs={12} md={3}>
        <CustomerActionsSidebar
          customerName={customer.customer_name}
          customId={customer.custom_id}
          courseName={customer.course_name}
          monthlyTotal={monthlyTotal}
          billingRoundingEnabled={billingRoundingEnabled}
          onToggleBillingRounding={handleToggleBillingRounding}
          billingMethod={billingMethod}
          onChangeBillingMethod={handleChangeBillingMethod}
          onOpenEditForm={handleOpenEditForm}
          onOpenUnitPriceChange={() => setOpenUnitPriceChange(true)}
          onOpenTemporaryQuantityChange={() => setOpenTemporaryQuantityChange(true)}
          onOpenSuspendProduct={() => setOpenSuspendProduct(true)}
          onOpenCancelProduct={() => setOpenCancelProduct(true)}
          onOpenBankInfo={() => setOpenBankInfo(true)}
        />
      </Grid>

      {/* 以下、各種ダイアログのプレースホルダー */}
      {/* 単価変更 */}
      <Grid item xs={12}>
        <Dialog open={openUnitPriceChange} onClose={() => setOpenUnitPriceChange(false)} fullWidth maxWidth="sm">
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>単価変更</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel id="unit-price-change-product-label">対象商品</InputLabel>
                <Select
                  labelId="unit-price-change-product-label"
                  label="対象商品"
                  value={unitPriceChangeTargetId}
                  onChange={(e) => setUnitPriceChangeTargetId(typeof e.target.value === 'number' ? e.target.value : Number(e.target.value))}
                >
                  {patterns.filter(p => p.is_active).map((p) => (
                    <MenuItem key={p.id} value={p.id!}>
                      {p.product_name}（{p.manufacturer_name}） / 現在単価: ¥{p.unit_price.toLocaleString()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="変更後単価"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={unitPriceChangeNewPrice}
                onChange={(e) => setUnitPriceChangeNewPrice(e.target.value === '' ? '' : Number(e.target.value))}
                fullWidth
              />

              <TextField
                label="変更開始月"
                type="month"
                value={unitPriceChangeStartMonth}
                onChange={(e) => setUnitPriceChangeStartMonth(e.target.value)}
                fullWidth
                helperText="この月の1日から新しい単価を適用します"
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setOpenUnitPriceChange(false)}>閉じる</Button>
              <Button
                variant="contained"
                disabled={unitPriceChangeSaving || unitPriceChangeTargetId === '' || unitPriceChangeNewPrice === '' || !unitPriceChangeStartMonth}
                onClick={handleUnitPriceChangeSave}
              >
                {unitPriceChangeSaving ? '保存中...' : '保存'}
              </Button>
            </Box>
          </Box>
        </Dialog>
      </Grid>

      {/* 一時的な数量変更 */}
      <Grid item xs={12}>
        <Dialog open={openTemporaryQuantityChange} onClose={() => setOpenTemporaryQuantityChange(false)} fullWidth maxWidth="sm">
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>一時的な数量変更</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              ここに対象商品の選択、適用日、数量の入力フォームを追加します。
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setOpenTemporaryQuantityChange(false)}>閉じる</Button>
              <Button variant="contained" disabled>保存（未実装）</Button>
            </Box>
          </Box>
        </Dialog>
      </Grid>

      {/* 商品の休止 */}
      <Grid item xs={12}>
        <Dialog open={openSuspendProduct} onClose={() => setOpenSuspendProduct(false)} fullWidth maxWidth="sm">
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>商品の休止（期間指定）</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              ここに休止対象商品の選択、休止開始日・終了日の入力フォームを追加します。
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setOpenSuspendProduct(false)}>閉じる</Button>
              <Button variant="contained" disabled>保存（未実装）</Button>
            </Box>
          </Box>
        </Dialog>
      </Grid>

      {/* 商品の中止 */}
      <Grid item xs={12}>
        <Dialog open={openCancelProduct} onClose={() => setOpenCancelProduct(false)} fullWidth maxWidth="sm">
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>商品の中止（契約終了）</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              ここに中止対象商品の選択、適用日の入力フォーム、理由の入力欄を追加します。
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setOpenCancelProduct(false)}>閉じる</Button>
              <Button variant="contained" color="error" disabled>中止を確定（未実装）</Button>
            </Box>
          </Box>
        </Dialog>
      </Grid>

      {/* 端数処理（1の位切り捨て） */}
      <Grid item xs={12}>
        <Dialog open={openBillingRounding} onClose={() => setOpenBillingRounding(false)} fullWidth maxWidth="sm">
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>端数処理の設定</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              当月請求の端数処理を選択してください（例：1の位切り捨て）。
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setOpenBillingRounding(false)}>閉じる</Button>
              <Button variant="contained" disabled>保存（未実装）</Button>
            </Box>
          </Box>
        </Dialog>
      </Grid>

      {/* 口座情報（引き落し選択時の詳細設定） */}
      <Grid item xs={12}>
        <Dialog open={openBankInfo} onClose={() => setOpenBankInfo(false)} fullWidth maxWidth="sm">
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>口座情報</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              ここに金融機関名、支店名、口座種別、口座番号、名義などの入力欄を追加します。（未実装）
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => setOpenBankInfo(false)}>閉じる</Button>
              <Button variant="contained" disabled>保存（未実装）</Button>
            </Box>
          </Box>
        </Dialog>
      </Grid>

      {/* セル編集ポップオーバー */}
      <Popover
        open={Boolean(cellMenuAnchor)}
        anchorEl={cellMenuAnchor}
        onClose={closeCellMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1, minWidth: 220 }}>
          <Typography variant="subtitle2" sx={{ px: 1, py: 0.5 }}>
            {selectedCell ? `${selectedCell.productName} / ${selectedCell.date}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 1 }}>
            <Button size="small" onClick={() => { closeCellMenu(); openChangeQuantity(); }}>
              本数変更（当日）
            </Button>
            <Button size="small" onClick={() => { applySkipForDay(); }}>
              休配（当日）
            </Button>
            <Button size="small" onClick={handleCancelFromSelectedDate}>
              解約（この日以降）
            </Button>
            <Button size="small" onClick={handleOpenPatternChange}>
              パターン変更
            </Button>
            <Button size="small" onClick={() => { closeCellMenu(); if (selectedCell) tempChangeManagerRef.current?.openAddForDate(selectedCell.date); }}>
              臨時商品追加（当日）
            </Button>
          </Box>
        </Box>
      </Popover>

      {/* 本数変更ダイアログ */}
      <Dialog open={openQuantityDialog} onClose={closeChangeQuantity} fullWidth maxWidth="xs">
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>本数変更（当日）</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {selectedCell ? `${selectedCell.productName} / ${selectedCell.date}` : ''}
          </Typography>
          <TextField
            label="本数"
            type="number"
            inputProps={{ min: 0, step: 1 }}
            value={editQuantityValue}
            onChange={(e) => setEditQuantityValue(e.target.value === '' ? '' : Number(e.target.value))}
            fullWidth
            autoFocus
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={closeChangeQuantity}>キャンセル</Button>
            <Button variant="contained" onClick={saveChangeQuantity} disabled={editQuantityValue === '' || Number(editQuantityValue) < 0}>
              保存
            </Button>
          </Box>
        </Box>
      </Dialog>

    </Grid>
  );
};

export default CustomerDetail;