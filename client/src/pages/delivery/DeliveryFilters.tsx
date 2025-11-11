import React from 'react';
import { Box, Card, CardContent, Grid, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox, FormControlLabel, Button } from '@mui/material';

interface DeliveryFiltersProps {
  startDate: string;
  days: number;
  selectedCourse: string;
  courses: any[];
  selectedManufacturers: string[];
  manufacturerOptions: string[];
  loading: boolean;
  autoFetch: boolean;
  groupByManufacturer: boolean;
  showTotalAmount: boolean;
  disableOutputs: boolean;
  onStartDateChange: (value: string) => void;
  onDaysChange: (value: number) => void;
  onCourseChange: (value: string) => void;
  onSelectedManufacturersChange: (value: string[]) => void;
  onAutoFetchChange: (value: boolean) => void;
  onGroupByManufacturerChange: (value: boolean) => void;
  onShowTotalAmountChange: (value: boolean) => void;
  onToday: () => void;
  onWeek: () => void;
  onFetchSummary: () => void;
  onPrint: () => void;
  onCsvExport: () => void;
  onPdfExport: () => void;
}

export const DeliveryFilters: React.FC<DeliveryFiltersProps> = ({
  startDate,
  days,
  selectedCourse,
  courses,
  selectedManufacturers,
  manufacturerOptions,
  loading,
  autoFetch,
  groupByManufacturer,
  showTotalAmount,
  disableOutputs,
  onStartDateChange,
  onDaysChange,
  onCourseChange,
  onSelectedManufacturersChange,
  onAutoFetchChange,
  onGroupByManufacturerChange,
  onShowTotalAmountChange,
  onToday,
  onWeek,
  onFetchSummary,
  onPrint,
  onCsvExport,
  onPdfExport,
}) => {
  return (
    <Card sx={{ mb: 3 }} className="print-header-hide">
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              label="開始日"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              label="日数"
              type="number"
              value={days}
              onChange={(e) => onDaysChange(parseInt(e.target.value) || 1)}
              fullWidth
              inputProps={{ min: 1, max: 31 }}
              helperText="1〜31日"
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>配達コース</InputLabel>
              <Select
                value={selectedCourse}
                label="配達コース"
                onChange={(e) => onCourseChange(e.target.value as string)}
              >
                <MenuItem value="all">全コース（合計）</MenuItem>
                <MenuItem value="all-by-course">全コース（コース別）</MenuItem>
                {courses && courses.length > 0 ? courses.map((course: any) => (
                  <MenuItem key={course.id} value={course.id?.toString() || ''}>
                    {course.course_name || `コース${course.id}`}
                  </MenuItem>
                )) : null}
              </Select>
            </FormControl>
          </Grid>
          {/* メーカー絞り込み */}
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>メーカー絞り込み</InputLabel>
              <Select
                multiple
                value={selectedManufacturers}
                label="メーカー絞り込み"
                onChange={(e) => {
                  const value = e.target.value as string[];
                  onSelectedManufacturersChange(Array.isArray(value) ? value : []);
                }}
                renderValue={(selected) => {
                  const arr = selected as string[];
                  if (!arr || arr.length === 0) return '（全メーカー）';
                  return arr.join(', ');
                }}
              >
                {manufacturerOptions.map((name) => (
                  <MenuItem key={name} value={name}>
                    <Checkbox checked={selectedManufacturers.indexOf(name) > -1} />
                    <span>{name}</span>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" onClick={onToday} size="small">今日</Button>
              <Button variant="outlined" onClick={onWeek} size="small">1週間</Button>
              <Button variant="text" onClick={() => onSelectedManufacturersChange([])} size="small">絞り込みクリア</Button>
            </Box>
          </Grid>
        </Grid>

        {/* 出力ボタン */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Button
            variant="contained"
            onClick={onFetchSummary}
            disabled={loading || !startDate || days <= 0}
          >
            {loading ? '集計中...' : '集計'}
          </Button>
          <FormControlLabel
            control={<Checkbox checked={autoFetch} onChange={(e) => onAutoFetchChange(e.target.checked)} size="small" />}
            label="自動集計"
            sx={{ ml: 1 }}
          />
          {/* メーカー別グループ化トグル */}
          <FormControlLabel
            control={<Checkbox checked={groupByManufacturer} onChange={(e) => onGroupByManufacturerChange(e.target.checked)} size="small" />}
            label="メーカー別でグループ化"
            sx={{ ml: 1 }}
          />
          {/* 総金額表示トグル */}
          <FormControlLabel
            control={<Checkbox checked={showTotalAmount} onChange={(e) => onShowTotalAmountChange(e.target.checked)} size="small" />}
            label="総金額を表示"
            sx={{ ml: 1 }}
          />
          <Button variant="outlined" disabled={disableOutputs} onClick={onPrint}>
            印刷
          </Button>
          <Button variant="outlined" disabled={disableOutputs} onClick={onCsvExport}>
            CSV出力
          </Button>
          <Button variant="outlined" disabled={disableOutputs} onClick={onPdfExport}>
            PDF出力
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};