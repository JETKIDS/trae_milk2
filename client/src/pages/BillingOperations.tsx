import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Button, Stack, Divider, Alert, ToggleButtonGroup, ToggleButton, TextField, FormControl, InputLabel, Select, MenuItem, CircularProgress } from '@mui/material';
import axios from 'axios';

const BillingOperations: React.FC = () => {
  const [preview, setPreview] = useState<any | null>(null);
  const [parse, setParse] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  const [roundingRule, setRoundingRule] = useState<'round' | 'floor' | 'ceil'>('round');
  const [outputMonth, setOutputMonth] = useState<string>(new Date().toISOString().slice(0,7)); // YYYY-MM
  const [courses, setCourses] = useState<Array<{ id: number; custom_id?: string; course_name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [loadingCourses, setLoadingCourses] = useState<boolean>(false);
  const [customers, setCustomers] = useState<Array<{ id: number; custom_id?: string; customer_name: string; address?: string; phone?: string }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);

  const monthLabel = (() => {
    try {
      const d = new Date(`${outputMonth}-01T00:00:00`);
      const m = d.getMonth() + 1;
      return `${m}月分`;
    } catch {
      return '対象月未設定';
    }
  })();

  const handleLoadPreview = async () => {
    try {
      setLoadingPreview(true);
      const res = await axios.get('/api/debits/preview');
      setPreview(res.data);
    } catch (err: any) {
      console.error(err);
      setPreview({ error: err?.response?.data?.error || 'プレビューの取得に失敗しました' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleLoadParse = async () => {
    try {
      setLoadingParse(true);
      const res = await axios.get('/api/debits/parse');
      setParse(res.data);
    } catch (err: any) {
      console.error(err);
      setParse({ error: err?.response?.data?.error || '解析の取得に失敗しました' });
    } finally {
      setLoadingParse(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoadingCourses(true);
      try {
        const res = await axios.get('/api/masters/courses');
        setCourses(res.data || []);
      } catch (e) {
        console.error('コース一覧取得失敗', e);
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedCourseId && outputMonth) {
      (async () => {
        // month（YYYY-MM）は将来的に試算・確定額表示に使用予定。現時点では一覧取得のみ。
        setLoadingCustomers(true);
        try {
          const res = await axios.get(`/api/customers/by-course/${Number(selectedCourseId)}`);
          setCustomers(res.data || []);
        } catch (e) {
          console.error('顧客一覧取得失敗', e);
          setCustomers([]);
        } finally {
          setLoadingCustomers(false);
        }
      })();
    } else {
      setCustomers([]);
    }
  }, [selectedCourseId, outputMonth]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        請求業務
      </Typography>

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              請求コース
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel id="billing-course-select-label">コース</InputLabel>
              <Select
                labelId="billing-course-select-label"
                label="コース"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(typeof e.target.value === 'number' ? e.target.value : Number(e.target.value))}
              >
                {loadingCourses && (
                  <MenuItem value="">
                    <CircularProgress size={20} sx={{ mr: 1 }} /> 読み込み中...
                  </MenuItem>
                )}
                {!loadingCourses && courses.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.custom_id ? `${c.custom_id} - ${c.course_name}` : c.course_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              対象月
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="出力月"
                type="month"
                value={outputMonth}
                onChange={(e) => setOutputMonth(e.target.value)}
                size="small"
              />
              <Typography variant="body1">{monthLabel}</Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              顧客一覧
            </Typography>
            {!selectedCourseId && (
              <Typography variant="body2" color="text.secondary">
                コースを選択してください。
              </Typography>
            )}
            {selectedCourseId && loadingCustomers && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CircularProgress size={20} sx={{ mr: 1 }} /> 読み込み中...
              </Box>
            )}
            {selectedCourseId && !loadingCustomers && customers.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                顧客が見つかりません。
              </Typography>
            )}
            {selectedCourseId && !loadingCustomers && customers.length > 0 && (
              <Box>
                {customers.map((c) => (
                  <Box key={c.id} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      {c.custom_id ? `[${c.custom_id}] ` : ''}{c.customer_name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              端数処理ルール
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              税計算は各商品ごとに行い、合算後に最終丸めを適用します。
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={roundingRule}
              onChange={(_, v) => v && setRoundingRule(v)}
              size="small"
            >
              <ToggleButton value="round">四捨五入（1円単位）</ToggleButton>
              <ToggleButton value="floor">切り捨て（1円単位）</ToggleButton>
              <ToggleButton value="ceil">切り上げ（1円単位）</ToggleButton>
            </ToggleButtonGroup>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              引き落し用ファイル（Zengin）プレビュー／解析
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={handleLoadPreview} disabled={loadingPreview}>
                プレビューを取得
              </Button>
              <Button variant="outlined" onClick={handleLoadParse} disabled={loadingParse}>
                解析を取得
              </Button>
            </Stack>
            {preview?.error && <Alert severity="error">{preview.error}</Alert>}
            {preview && !preview.error && (
              <Box sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                <Typography variant="subtitle2">encoding: {preview.encoding}</Typography>
                <Typography variant="subtitle2">totalLines: {preview.totalLines}</Typography>
                <Divider sx={{ my: 1 }} />
                {Array.isArray(preview.preview) && preview.preview.map((l: any) => (
                  <Box key={l.index} sx={{ mb: 0.5 }}>
                    [{l.index}] type={l.recordType} len={l.length} amt?={l.amountCandidate} text={l.sample}
                  </Box>
                ))}
              </Box>
            )}
            <Divider sx={{ my: 2 }} />
            {parse?.error && <Alert severity="error">{parse.error}</Alert>}
            {parse && !parse.error && (
              <Box sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                <Typography variant="subtitle2">linesAnalyzed: {parse.linesAnalyzed}</Typography>
                <Typography variant="subtitle2">totalAmountCandidate: {parse.totalAmountCandidate}</Typography>
                <Divider sx={{ my: 1 }} />
                {Array.isArray(parse.items) && parse.items.map((it: any, idx: number) => (
                  <Box key={idx} sx={{ mb: 0.5 }}>
                    [{it.index}] len={it.length} name?={it.name} amt?={it.amountCandidate} raw={it.raw}
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              請求書PDF（テンプレート）
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              会社情報（マスタ）からヘッダーを構成し、レイアウトは提供画像をもとに作成予定です。
            </Typography>
            <Button variant="contained" disabled>
              生成（準備中）
            </Button>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default BillingOperations;