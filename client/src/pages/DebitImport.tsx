import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Container, Grid, MenuItem, Select, TextField, Typography, Paper } from '@mui/material';
import { pad7 } from '../utils/id';

interface ParsedItem {
  idx: number;
  length: number;
  name: string;
  amountCandidate: string | null;
  raw: string;
}

interface CustomersPagedResp {
  items: Array<{ id: number; custom_id: string; customer_name: string; yomi?: string | null }>;
  total: number;
}

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export default function DebitImport() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [customers, setCustomers] = useState<CustomersPagedResp['items']>([]);
  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(currentMonth);
  const [mapping, setMapping] = useState<Record<number, number | null>>({}); // idx -> customer_id
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [candidates, setCandidates] = useState<Record<number, number | null>>({}); // 自動候補: idx -> customer_id

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const parseResp = await fetch('/api/debits/parse');
        const parseJson = await parseResp.json();
        const parsed: ParsedItem[] = parseJson.items || [];
        setItems(parsed);

        // 顧客一覧（最大500件）
        const custResp = await fetch('/api/customers/paged?page=1&pageSize=500');
        const custJson: CustomersPagedResp = await custResp.json();
        setCustomers(custJson.items || []);
      } catch (e: any) {
        console.error('デビット解析読み込みエラー:', e);
        setMessage(`読み込みエラー: ${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sumParsed = useMemo(() => {
    return items.reduce((sum, it) => {
      const n = it.amountCandidate ? parseInt(String(it.amountCandidate).replace(/\D/g, ''), 10) : 0;
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [items]);

  const sumMapped = useMemo(() => {
    return items.reduce((sum, it) => {
      const cid = mapping[it.idx];
      if (!cid) return sum;
      const n = it.amountCandidate ? parseInt(String(it.amountCandidate).replace(/\D/g, ''), 10) : 0;
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [items, mapping]);

  const handleChangeMap = (idx: number, customerId: number | null) => {
    setMapping(prev => ({ ...prev, [idx]: customerId }));
  };

  const normalize = (s: string) => {
    return String(s || '')
      .replace(/[\s　]/g, '')
      .replace(/[()（）]/g, '')
      .toLowerCase();
  };

  const calcCandidateFor = (it: ParsedItem) => {
    const base = normalize(it.name || '');
    if (!base || base.length < 2) return null;
    let bestId: number | null = null;
    let bestScore = 0;
    for (const c of customers) {
      const n1 = normalize(c.customer_name);
      const n2 = normalize(c.yomi || '');
      let score = 0;
      // よみがな先頭一致を優先
      if (n2 && base.startsWith(n2.slice(0, Math.min(3, n2.length)))) score += 3;
      // 名前の部分一致
      if (n1 && (n1.includes(base) || base.includes(n1.slice(0, Math.min(3, n1.length))))) score += 2;
      // よみがなの部分一致
      if (n2 && (n2.includes(base) || base.includes(n2.slice(0, Math.min(3, n2.length))))) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    }
    // 閾値: 2以上のみ採用
    return bestScore >= 2 ? bestId : null;
  };

  const computeCandidates = () => {
    const cand: Record<number, number | null> = {};
    for (const it of items) {
      cand[it.idx] = calcCandidateFor(it);
    }
    setCandidates(cand);
  };

  const applyCandidates = () => {
    setMapping(prev => {
      const next = { ...prev };
      for (const it of items) {
        const cid = candidates[it.idx];
        if (cid) next[it.idx] = cid;
      }
      return next;
    });
  };

  const clearMapping = () => {
    setMapping({});
    setCandidates({});
  };

  const registerSelected = async () => {
    try {
      setRegistering(true);
      setMessage('');
      let success = 0;
      let failed = 0;

      for (const it of items) {
        const cid = mapping[it.idx];
        if (!cid) continue;
        const amt = it.amountCandidate ? parseInt(String(it.amountCandidate).replace(/\D/g, ''), 10) : 0;
        if (!amt || isNaN(amt)) continue;
        try {
          const resp = await fetch(`/api/customers/${cid}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, month, amount: amt, method: 'debit', note: `CSV#${it.idx} ${it.name}` })
          });
          if (!resp.ok) {
            failed++;
            const err = await resp.json().catch(() => ({}));
            console.error('登録失敗:', err);
          } else {
            success++;
          }
        } catch (e) {
          failed++;
          console.error('登録エラー:', e);
        }
      }

      setMessage(`登録完了: 成功 ${success} 件 / 失敗 ${failed} 件`);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 3 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom>引き落しCSVインポート</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              label="対象年"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value || '0', 10))}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label="対象月"
              type="number"
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value || '0', 10))}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box display="flex" justifyContent="flex-end" gap={2}>
              <Typography variant="body1">CSV合計: ￥{sumParsed.toLocaleString()}</Typography>
              <Typography variant="body1">選択合計: ￥{sumMapped.toLocaleString()}</Typography>
              <Button variant="outlined" onClick={computeCandidates}>自動候補</Button>
              <Button variant="outlined" onClick={applyCandidates}>候補を反映</Button>
              <Button variant="text" color="secondary" onClick={clearMapping}>クリア</Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {message && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography color="primary">{message}</Typography>
        </Paper>
      )}

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={1}>
          <Grid item xs={12}>
            <Box display="flex" justifyContent="flex-end" mb={1}>
              <Button variant="contained" color="primary" onClick={registerSelected} disabled={registering}>
                {registering ? '登録中...' : '選択した入金を登録'}
              </Button>
            </Box>
          </Grid>
          {items.map((it) => {
            const amt = it.amountCandidate ? parseInt(String(it.amountCandidate).replace(/\D/g, ''), 10) : 0;
            return (
              <Grid container key={it.idx} spacing={1} alignItems="center" sx={{ borderBottom: '1px solid #eee', py: 1 }}>
                <Grid item xs={12} sm={1}>
                  <Typography variant="body2">#{it.idx}</Typography>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Typography variant="body2">{it.name || '(名前候補なし)'}</Typography>
                  <Typography variant="caption" sx={{ color: '#888' }}>{it.raw}</Typography>
                </Grid>
                <Grid item xs={12} sm={2}>
                  <Typography variant="body2" sx={{ textAlign: 'right' }}>￥{(isNaN(amt) ? 0 : amt).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={12} sm={5}>
                  <Select
                    size="small"
                    fullWidth
                    displayEmpty
                    value={mapping[it.idx] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      handleChangeMap(it.idx, v === '' ? null : Number(v));
                    }}
                    renderValue={(selected) => {
                      if (!selected) return '顧客を選択…';
                      const c = customers.find(cc => cc.id === Number(selected));
                      return c ? `${pad7(c.custom_id)} ${c.customer_name}` : '顧客を選択…';
                    }}
                  >
                    <MenuItem value=""><em>未選択</em></MenuItem>
                    {customers.map(c => (
                      <MenuItem key={c.id} value={c.id}>
                        {pad7(c.custom_id)} {c.customer_name} {c.yomi ? `(${c.yomi})` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                  {candidates[it.idx] && (
                    <Typography variant="caption" sx={{ color: '#1976d2' }}>
                      候補: {(() => {
                        const c = customers.find(cc => cc.id === candidates[it.idx]);
                        return c ? `${pad7(c.custom_id)} ${c.customer_name}` : '';
                      })()}
                    </Typography>
                  )}
                </Grid>
              </Grid>
            );
          })}
        </Grid>
      </Paper>
    </Container>
  );
}