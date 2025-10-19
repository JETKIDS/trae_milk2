import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Button, Stack, Divider, Alert, ToggleButtonGroup, ToggleButton, TextField, FormControl, InputLabel, Select, MenuItem, CircularProgress, Tabs, Tab } from '@mui/material';
import BulkCollection from './BulkCollection';
import InvoiceIssuance from './InvoiceIssuance';
import MonthlyManagement from './MonthlyManagement';

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
  const [roundingRule, setRoundingRule] = useState<'round' | 'floor' | 'ceil'>('round');
  const [outputMonth, setOutputMonth] = useState<string>(new Date().toISOString().slice(0,7)); // YYYY-MM
  const [courses, setCourses] = useState<Array<{ id: number; custom_id?: string; course_name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>('');
  const [loadingCourses, setLoadingCourses] = useState<boolean>(false);
  const [customers, setCustomers] = useState<Array<{ id: number; custom_id?: string; customer_name: string; address?: string; phone?: string }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);

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
          <BulkCollection method="both" readOnly />
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
              {parse?.error && <Alert severity="error">{parse.error}</Alert>}
              {parse && !parse.error && (
                <Box sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                  <Typography variant="subtitle2">items: {Array.isArray(parse.items) ? parse.items.length : 0}</Typography>
                  <Typography variant="subtitle2">linesAnalyzed: {parse.linesAnalyzed}</Typography>
                  <Divider sx={{ my: 1 }} />
                  {Array.isArray(parse.items) && parse.items.map((it: any, idx: number) => (
                    <Box key={idx} sx={{ mb: 0.5 }}>
                      [#{it.idx}] len={it.length} name={it.name} amt?={it.amountCandidate}
                    </Box>
                  ))}
                </Box>
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