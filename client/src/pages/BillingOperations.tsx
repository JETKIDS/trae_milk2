import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Button, Stack, Divider, Alert, ToggleButtonGroup, ToggleButton, TextField, FormControl, InputLabel, Select, MenuItem, CircularProgress, Tabs, Tab } from '@mui/material';
import BulkCollection from './BulkCollection';
import InvoiceIssuance from './InvoiceIssuance';
import MonthlyManagement from './MonthlyManagement';
import CollectionList from './CollectionList';

import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { pad7 } from '../utils/id';

const BillingOperations: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'invoices' | 'monthly' | 'bulk' | 'debitData' | 'collectionList'>('invoices');
  const [bulkMethod, setBulkMethod] = useState<'collection' | 'debit'>('collection');
  const [preview, setPreview] = useState<any | null>(null);
  const [parse, setParse] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  // Removed unused roundingRule state
  // const [roundingRule, setRoundingRule] = useState<'round' | 'floor' | 'ceil'>('round');
  const [outputMonth, setOutputMonth] = useState<string>(new Date().toISOString().slice(0,7)); // YYYY-MM
  const [courses, setCourses] = useState<Array<{ id: number; custom_id?: string; course_name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [loadingCourses, setLoadingCourses] = useState<boolean>(false);
  const [customers, setCustomers] = useState<Array<{ id: number; custom_id?: string; customer_name: string; address?: string; phone?: string }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);
  const [generatingCsv, setGeneratingCsv] = useState<boolean>(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [csvFormat, setCsvFormat] = useState<'standard' | 'zengin' | 'zengin_fixed'>('zengin');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'bulk' || tab === 'invoices' || tab === 'monthly' || tab === 'debitData' || tab === 'collectionList') {
      setActiveTab(tab as 'invoices' | 'monthly' | 'bulk' | 'debitData' | 'collectionList');
    }
    const method = searchParams.get('method');
    if (method === 'collection' || method === 'debit') {
      setBulkMethod(method as 'collection' | 'debit');
    }
  }, [searchParams]);

  const handleChangeTab = (_e: React.SyntheticEvent, value: 'invoices' | 'monthly' | 'bulk' | 'debitData' | 'collectionList') => {
    setActiveTab(value);
    setSearchParams({ tab: value, ...(value === 'bulk' ? { method: bulkMethod } : {}) });
  };

  const handleChangeBulkMethod = (_e: React.SyntheticEvent, value: 'collection' | 'debit') => {
    if (!value) return;
    setBulkMethod(value);
    setSearchParams({ tab: 'bulk', method: value });
  };

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

  const handleGenerateCsv = async () => {
    setGenerateError(null);
    if (!outputMonth || !/^\d{4}-\d{2}$/.test(outputMonth)) {
      setGenerateError('対象月(YYYY-MM)を入力してください');
      return;
    }
    try {
      setGeneratingCsv(true);
      const params: any = { month: outputMonth };
      if (selectedCourseId !== '' && !isNaN(Number(selectedCourseId))) {
        params.courseId = Number(selectedCourseId);
      }
      if (csvFormat) {
        params.format = csvFormat;
      }
      const res = await axios.get('/api/debits/generate', {
        params,
        responseType: 'arraybuffer'
      });
      const mime = csvFormat === 'zengin_fixed' ? 'text/plain' : 'text/csv';
      const blob = new Blob([res.data], { type: mime });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = csvFormat === 'zengin_fixed' ? 'zengin_fixed.txt' : (csvFormat === 'zengin' ? 'zengin.csv' : 'ginkou.csv');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('CSV生成失敗', err);
      const msg = err?.response?.data?.error || err?.message || 'CSV生成に失敗しました';
      setGenerateError(msg);
    } finally {
      setGeneratingCsv(false);
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
    if (selectedCourseId !== '' && outputMonth) {
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
      {/* 印刷時はタイトルを非表示 */}
      <Typography variant="h4" component="h1" gutterBottom className="no-print">
        請求業務
      </Typography>

      <Stack spacing={3}>
        {/* タブカードも印刷時は非表示 */}
        <Card className="no-print">
          <CardContent>
            <Tabs value={activeTab} onChange={handleChangeTab} aria-label="billing tabs">
              <Tab label="請求書発行" value="invoices" />
              <Tab label="月次管理" value="monthly" />
              <Tab label="集金一覧表" value="collectionList" />
              <Tab label="引き落しデータ作成" value="debitData" />
              <Tab label="一括入金" value="bulk" />
            </Tabs>
          </CardContent>
        </Card>

        {activeTab === 'bulk' && (
          <> 
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>集金方法</Typography>
                <ToggleButtonGroup
                  exclusive
                  value={bulkMethod}
                  onChange={handleChangeBulkMethod}
                  size="small"
                >
                  <ToggleButton value="collection">集金</ToggleButton>
                  <ToggleButton value="debit">引き落し</ToggleButton>
                </ToggleButtonGroup>
              </CardContent>
            </Card>
            {bulkMethod === 'collection' ? (
              <BulkCollection method={bulkMethod} />
            ) : (
              <BulkCollection method={bulkMethod} />
            )}
          </>
        )}

        {activeTab === 'collectionList' && (
          <CollectionList />
        )}

        {activeTab === 'debitData' && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                引き落しデータ作成
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                引き落し用ファイル（全国銀行協会フォーマット）のプレビュー／解析を実行します。
              </Typography>

              {/* 生成（CSVダウンロード） */}
              <Stack spacing={2} sx={{ mb: 2 }}>
                <Typography variant="subtitle1">CSV生成（{monthLabel}）</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <TextField
                    label="対象月 (YYYY-MM)"
                    type="month"
                    value={outputMonth}
                    onChange={(e) => setOutputMonth(e.target.value)}
                    size="small"
                  />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="course-select-label" shrink>対象コース</InputLabel>
                    <Select
                      labelId="course-select-label"
                      label="対象コース"
                      value={selectedCourseId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedCourseId(v === '' ? '' : Number(v));
                      }}
                      displayEmpty
                      renderValue={() => {
                        if (selectedCourseId === '') {
                          return '全コース';
                        }
                        const selected = courses.find(c => c.id === Number(selectedCourseId));
                        return selected ? `${selected.custom_id ? `${pad7(selected.custom_id)} ` : ''}${selected.course_name}` : '';
                      }}
                    >
                      <MenuItem value="">全コース</MenuItem>
                      {courses.map(c => (
                        <MenuItem key={c.id} value={c.id}>{c.custom_id ? `${pad7(c.custom_id)} ` : ''}{c.course_name}</MenuItem>
                      ))}
                    </Select>
                    {/* コース一覧取得中のインジケータ */}
                    {loadingCourses && (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', ml: 1 }}>
                        <CircularProgress size={14} />
                      </Box>
                    )}
                  </FormControl>
                  <InputLabel id="format-select-label" shrink>フォーマット</InputLabel>
                  <Select
                    labelId="format-select-label"
                    label="フォーマット"
                    value={csvFormat}
                    onChange={(e) => setCsvFormat(e.target.value as 'standard' | 'zengin' | 'zengin_fixed')}
                  >
                    <MenuItem value="standard">標準</MenuItem>
                    <MenuItem value="zengin">全銀（CSV）</MenuItem>
                    <MenuItem value="zengin_fixed">全銀（固定長）</MenuItem>
                  </Select>
                  <Button variant="contained" onClick={handleGenerateCsv} disabled={generatingCsv}>
                    {generatingCsv ? '生成中...' : (csvFormat === 'zengin_fixed' ? '固定長ファイルを生成してダウンロード' : 'CSVを生成してダウンロード')}
                  </Button>
                </Stack>
                {generateError && <Alert severity="error">{generateError}</Alert>
                }
                <Typography variant="caption" color="text.secondary">
                  ※ フォーマット切替可。全銀（CSV/固定長）を選択すると、銀行コード・支店コード・預金種別(1/2)・口座番号・口座名義(半角ｶﾅ)・金額・顧客ID・顧客コード・氏名をCP932エンコードで出力します。金額0円は除外、口座項目の不備がある顧客は出力対象外です。標準は従来の4列CSV（customer_id, custom_id, customer_name, amount）です。
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Button variant="outlined" onClick={handleLoadPreview} disabled={loadingPreview}>
                  {loadingPreview ? '読み込み中...' : 'プレビューを読み込む'}
                </Button>
                <Button variant="outlined" onClick={handleLoadParse} disabled={loadingParse}>
                  {loadingParse ? '解析中...' : '解析を実行'}
                </Button>
              </Stack>

              {preview && (
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1">プレビュー結果</Typography>
                    {preview.error ? (
                      <Alert severity="error">{preview.error}</Alert>
                    ) : (
                      <>
                        <Typography variant="body2">行数: {preview.totalLines}</Typography>
                        <Typography variant="body2">レコード別件数: {preview.recordTypeCounts ? JSON.stringify(preview.recordTypeCounts) : '-'}</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ maxHeight: 240, overflow: 'auto', border: '1px solid #eee', p: 1 }}>
                          {preview.previewLines?.map((l: any) => (
                            <Box key={l.idx} sx={{ fontFamily: 'monospace' }}>
                              [{String(l.idx).padStart(3,'0')}] len={l.length} type={l.recordType} amount={l.amountCandidate || '-'} : {l.sample}
                            </Box>
                          ))}
                        </Box>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {parse && (
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1">解析結果</Typography>
                    {parse.error ? (
                      <Alert severity="error">{parse.error}</Alert>
                    ) : (
                      <>
                        <Typography variant="body2">解析行数: {parse.linesAnalyzed}</Typography>
                        <Typography variant="body2">金額候補合計: {parse.totalAmountCandidate}</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ maxHeight: 240, overflow: 'auto', border: '1px solid #eee', p: 1 }}>
                          {parse.items?.map((it: any) => (
                            <Box key={it.idx} sx={{ fontFamily: 'monospace' }}>
                              [{String(it.idx).padStart(3,'0')}] len={it.length} name={it.name} amount={it.amountCandidate || '-'} : {it.raw}
                            </Box>
                          ))}
                        </Box>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'invoices' && (
          <InvoiceIssuance />
        )}

        {activeTab === 'monthly' && (
          <MonthlyManagement />
        )}
      </Stack>
    </Box>
  );
};

export default BillingOperations;