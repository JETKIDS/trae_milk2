import React from 'react';
import { Box, Grid, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Card, CardContent, Button } from '@mui/material';

interface CalendarProduct {
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  amount: number;
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  dayOfWeek: number; // 0..6
  isToday?: boolean;
  products: CalendarProduct[];
}

interface ProductMaster {
  product_name: string;
  sales_tax_type?: 'inclusive' | 'standard' | 'reduced' | string | null;
  purchase_tax_type?: 'inclusive' | 'standard' | 'reduced' | string | null;
  sales_tax_rate?: number | null;
}

interface Props {
  isStandalone: boolean;
  monthlyQuantities: Record<string, number>;
  calendar: CalendarDay[];
  productMapByName: Record<string, ProductMaster>;
  getTaxRateForProductName: (name: string) => number;
  monthlyTotal: number;
  prevInvoiceAmount: number;
  currentMonthPaymentAmount: number;
  carryoverDiff: number;
  currentDate: any; // moment.Moment
  onOpenInvoicePreview: () => void;
  onConfirmInvoice: () => void;
  onOpenCollectionDialog: () => void;
  onOpenPaymentHistory: () => void;
  invoiceConfirmed: boolean;
}

export const CustomerHistoryPanel: React.FC<Props> = ({
  isStandalone,
  monthlyQuantities,
  calendar,
  productMapByName,
  getTaxRateForProductName,
  monthlyTotal,
  prevInvoiceAmount,
  currentMonthPaymentAmount,
  carryoverDiff,
  currentDate,
  onOpenInvoicePreview,
  onConfirmInvoice,
  onOpenCollectionDialog,
  onOpenPaymentHistory,
  invoiceConfirmed,
}) => {
  return (
    <Box sx={{ mt: isStandalone ? 2 : 3 }}>
      <Grid container spacing={isStandalone ? 2 : 3}>
        <Grid item xs={12} md={8}>
          <Typography variant={isStandalone ? 'subtitle1' : 'h6'} gutterBottom>月次集計</Typography>
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
            <CardContent sx={{ p: isStandalone ? 1 : undefined }}>
              <Typography variant={isStandalone ? 'subtitle1' : 'h6'} gutterBottom>
                月次合計
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant={isStandalone ? 'h5' : 'h4'} color="primary" fontWeight="bold">
                  ¥{monthlyTotal.toLocaleString()}
                </Typography>
              </Box>
              <Typography variant="body2" color="textSecondary">
                前月請求 ¥{prevInvoiceAmount.toLocaleString()} / 今月入金 ¥{currentMonthPaymentAmount.toLocaleString()} / 過不足 ¥{carryoverDiff.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: isStandalone ? 0.5 : 1 }}>
                {currentDate.format('YYYY年M月')}分
              </Typography>
              <Box sx={{ mt: isStandalone ? 1 : 2, display: 'flex', gap: isStandalone ? 0.5 : 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  size={isStandalone ? 'small' : undefined}
                  onClick={onOpenInvoicePreview}
                >
                  請求書プレビュー
                </Button>
                <Button sx={{ ml: 1 }} variant="outlined" color="primary" onClick={onConfirmInvoice} size={isStandalone ? 'small' : undefined}>
                  月次請求確定
                </Button>
                <Button sx={{ ml: 1 }} variant="outlined" color="secondary" onClick={onOpenCollectionDialog} disabled={!invoiceConfirmed} size={isStandalone ? 'small' : undefined}>
                  集金を登録
                </Button>
                <Button sx={{ ml: 1 }} variant="outlined" onClick={onOpenPaymentHistory} size={isStandalone ? 'small' : undefined}>
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