import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
} from '@mui/material';
import { CalendarDay, ProductMaster } from '../types/customerDetail';
import moment from 'moment';

interface MonthlySummaryProps {
  calendar: CalendarDay[];
  currentDate: moment.Moment;
  productMapByName: Record<string, ProductMaster>;
  onInvoicePreview: () => void;
  onConfirmInvoice: () => void;
  onOpenCollectionDialog: () => void;
  onOpenPaymentHistory: () => void;
  invoiceConfirmed: boolean;
}

const MonthlySummary: React.FC<MonthlySummaryProps> = ({
  calendar,
  currentDate,
  productMapByName,
  onInvoicePreview,
  onConfirmInvoice,
  onOpenCollectionDialog,
  onOpenPaymentHistory,
  invoiceConfirmed
}) => {
  // 税率取得（商品マスタの数値を優先。なければ種別から推定）
  const getTaxRateForProductName = (name: string): number => {
    const pm = productMapByName[name];
    if (!pm) return 0.10;
    if (typeof pm.sales_tax_rate === 'number' && !isNaN(pm.sales_tax_rate)) {
      return pm.sales_tax_rate > 1 ? pm.sales_tax_rate / 100 : pm.sales_tax_rate;
    }
    const type = pm.sales_tax_type || pm.purchase_tax_type || 'standard';
    if (type === 'reduced') return 0.08;
    return 0.10;
  };

  const calculateDayTotal = (day: CalendarDay): number => {
    return day.products.reduce((total: number, product: any) => total + product.amount, 0);
  };

  const calculateMonthlyTotal = (): number => {
    return calendar.reduce((sum: number, day: CalendarDay) => sum + calculateDayTotal(day), 0);
  };

  const calculateMonthlyQuantity = (): { [key: string]: number } => {
    const quantities: { [key: string]: number } = {};
    
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

  const monthlyQuantities = useMemo(() => calculateMonthlyQuantity(), [calendar]);
  const monthlyTotal = useMemo(() => calculateMonthlyTotal(), [calendar]);

  return (
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
                  <TableCell align="right">消費税額（内税）</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(monthlyQuantities).map(([productName, quantity]) => {
                  let totalAmount = 0;
                  let totalTax = 0;
                  const priceSet = new Set<number>();
                  calendar.forEach((day) => {
                    day.products.forEach((p) => {
                      if (p.productName === productName) {
                        totalAmount += p.amount;
                        priceSet.add(p.unitPrice);
                        const rate = getTaxRateForProductName(p.productName);
                        const pm = productMapByName[p.productName];
                        const taxType = pm?.sales_tax_type || pm?.purchase_tax_type || 'standard';
                        if (taxType === 'inclusive') {
                          totalTax += p.amount * (rate / (1 + rate));
                        } else {
                          totalTax += p.amount * rate;
                        }
                      }
                    });
                  });

                  const unitPriceDisplay = priceSet.size === 1 ? Array.from(priceSet)[0] : null;

                  return (
                    <TableRow key={productName}>
                      <TableCell>{productName}</TableCell>
                      <TableCell align="right">{quantity}</TableCell>
                      <TableCell align="right">
                        {unitPriceDisplay !== null ? `¥${unitPriceDisplay.toLocaleString()}` : '複数'}
                      </TableCell>
                      <TableCell align="right">¥{totalAmount.toLocaleString()}</TableCell>
                      <TableCell align="right">（{Math.round(totalTax).toLocaleString()}）</TableCell>
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
              <Typography
                variant="body2"
                color={invoiceConfirmed ? 'success.main' : 'textSecondary'}
                sx={{ mt: 1 }}
                data-testid="status-invoice-confirmation"
              >
                {invoiceConfirmed ? '確定済み' : '未確定'}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexDirection: 'column' }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={onInvoicePreview}
                  data-testid="btn-invoice-preview"
                >
                  請求書プレビュー
                </Button>
                <Button 
                  variant="outlined" 
                  color="primary" 
                  onClick={onConfirmInvoice}
                  data-testid="btn-confirm-invoice"
                >
                  月次請求確定
                </Button>
                <Button 
                  variant="outlined" 
                  color="secondary" 
                  onClick={onOpenCollectionDialog} 
                  disabled={!invoiceConfirmed}
                  data-testid="btn-open-collection"
                >
                  集金を登録
                </Button>
                <Button 
                  variant="outlined" 
                  onClick={onOpenPaymentHistory}
                  data-testid="btn-open-payment-history"
                >
                  入金履歴
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default MonthlySummary;
