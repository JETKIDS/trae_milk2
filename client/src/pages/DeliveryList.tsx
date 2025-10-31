import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { LocalShipping, Print, GetApp, ExpandMore, PictureAsPdf } from '@mui/icons-material';
import { pad7 } from '../utils/id';

interface Course { id: number; custom_id?: string; course_name: string; }

const lazyExportToPdf = async () => (await import('../utils/pdfExport')).exportToPdf;



// 期間別・コース別配達リストタブのコンポーネント
const PeriodDeliveryListTab: React.FC = () => {
  // 今日の日付を取得してフォーマット（日本標準時）
  const getTodayString = (): string => {
    const today = new Date();
    // 日本標準時（UTC+9）に調整
    const jstOffset = 9 * 60; // 9時間をミリ秒に変換
    const jstTime = new Date(today.getTime() + (jstOffset * 60 * 1000));
    return jstTime.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(getTodayString());
  const [days, setDays] = useState<number>(1); // 終了日の代わりに日数
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [courses, setCourses] = useState<Course[]>([]);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [deliverySummary, setDeliverySummary] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
    const [skipMap, setSkipMap] = useState<Map<string, Set<string>>>(new Map());
    const [cancelMap, setCancelMap] = useState<Map<string, Set<string>>>(new Map());
    // 解約した商品の商品名などを補完するためのパターンマップ
    const [patternsMap, setPatternsMap] = useState<Map<string, any>>(new Map());
    // 顧客の内部ID（customer_id）と7桁ID（custom_id）の対応表
    const [idToCustomIdMap, setIdToCustomIdMap] = useState<Map<number, string>>(new Map());
  // ローカルストレージから自動計算設定を読み込み（配達リストタブ用）
  const [autoFetch, setAutoFetch] = useState<boolean>(() => {
    const saved = localStorage.getItem('deliveryListTab_autoFetch');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // シンプル表示フラグ（localStorageから復元）
  const [isSimpleDisplay, setIsSimpleDisplay] = useState<boolean>(() => {
    const saved = localStorage.getItem('deliveryList_simpleDisplay');
    return saved ? JSON.parse(saved) : false;
  });

  // 休配判定関数
  const isSkipped = useCallback((date: string, customerId: number, productId: number): boolean => {
    const key = `${date}-${customerId}`;
    const productSet = skipMap.get(key);
    return productSet ? productSet.has(String(productId)) : false;
  }, [skipMap]);

  // 解約判定関数
  const isCancelled = useCallback((date: string, customerId: number, productId: number): boolean => {
    const key = `${date}-${customerId}`;
    const productSet = cancelMap.get(key);
    return productSet ? productSet.has(String(productId)) : false;
  }, [cancelMap]);

  // 期間内の日付リストを生成
  const allDates = useMemo(() => {
    const dates: string[] = [];
    const start = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  }, [startDate, days]);

  // 終了日を計算する関数
  const calculateEndDate = useCallback((start: string, dayCount: number): string => {
    const startDateObj = new Date(start);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + dayCount - 1); // dayCount日分（開始日含む）
    return endDateObj.toISOString().split('T')[0];
  }, []);

  // コース一覧を取得する関数
  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch('/api/masters/courses');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCourses(data);
    } catch (error: any) {
      console.error('コース一覧の取得エラー:', error);
    }
  }, []);

  // CSV出力機能
  const handleCsvExport = useCallback(() => {
    if (!deliveryData || Object.keys(deliveryData).length === 0) return;
    
    const csvRows: string[] = [];
    
    // ヘッダー行
    csvRows.push('顧客ID,顧客名,住所,電話番号,配達日,商品名,数量,単位,単価,金額');
    
    // データ行
    Object.entries(deliveryData).forEach(([customerId, customerData]: [string, any]) => {
      customerData.products.forEach((product) => {
        csvRows.push([
          customerData.customer_id,
          `"${customerData.customer_name}"`,
          `"${customerData.address}"`,
          `"${customerData.phone || ''}"`,
          product.delivery_date,
          `"${product.product_name}"`,
          product.quantity,
          product.unit,
          product.unit_price,
          product.amount
        ].join(','));
      });
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `配達リスト_${startDate}_${days}日間.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [deliveryData, startDate, days]);

  // PDF出力機能（配達リスト）
  const handleDeliveryListPdfExport = useCallback(async () => {
    if (!deliveryData || Object.keys(deliveryData).length === 0) return;
    
    try {
      const exportToPdf = await lazyExportToPdf();
      await exportToPdf('delivery-list-content', {
        filename: `配達リスト_${startDate}_${days}日間.pdf`,
        title: `配達リスト (${startDate} - ${days}日間)`,
        orientation: 'landscape'
      });
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDF出力に失敗しました');
    }
  }, [deliveryData, startDate, days]);

  // 臨時変更を取得（バッチ処理でN+1問題を解決）
  const fetchTemporaryChangesInRange = async (start: string, end: string, customerIds: number[]) => {
    try {
      if (customerIds.length === 0) return [];
      
      // バッチAPIを使用して一括取得
      const response = await axios.get(`/api/temporary-changes/batch/period/${start}/${end}`, {
        params: { customerIds: customerIds.join(',') }
      });
      
      return Array.isArray(response.data) ? response.data : [];
    } catch (e) {
      console.warn('臨時変更データの一括取得でエラー。休配reflectはスキップされます:', e);
      return [];
    }
  };

  const buildSkipMap = (changes: any[]) => {
    const map = new Map<string, Set<string>>();
    changes.filter(c => c.change_type === 'skip').forEach((c: any) => {
      const key = `${c.change_date}-${c.customer_id}`;
      const set = map.get(key) || new Set<string>();
      if (c.product_id && Number.isFinite(Number(c.product_id))) {
        set.add(String(c.product_id));
      } else {
        set.add('ALL');
      }
      map.set(key, set);
    });
    return map;
  };

  // 顧客ごとの配達パターンを取得（タイムアウト・並列制御あり）
  const fetchDeliveryPatternsByCustomers = async (customerIds: number[]) => {
    try {
      const patterns: any[] = [];
      const batchSize = 10;
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize);
        const requests = batch.map((cid) => (
          axios.get(`/api/delivery-patterns/customer/${cid}`)
            .then((res) => Array.isArray(res.data) ? res.data.map((r: any) => ({ ...r, customer_id: typeof r.customer_id === 'number' ? r.customer_id : cid })) : [])
            .catch((err) => {
              console.warn(`顧客ID ${cid} の配達パターン取得に失敗しました`, err);
              return [];
            })
        ));
        const results = await Promise.allSettled(requests);
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            patterns.push(...r.value);
          }
        });
      }
      // パターンマップを作成（customerId-productId をキー）
      // 最新の情報で上書きする（商品名などを新パターンに合わせるため）
      const map = new Map<string, any>();
      patterns.forEach((p: any) => {
        const key = `${p.customer_id}-${p.product_id}`;
        map.set(key, p);
      });
      setPatternsMap(map);
      return { patterns, map };
    } catch (e) {
      console.warn('配達パターンデータの取得で予期せぬエラー:', e);
      return { patterns: [], map: new Map<string, any>() };
    }
  };

  // 解約マップ作成：end_date の翌日に「解」を表示
  // ただし、翌日に同一顧客・同一商品の新しいアクティブルパターンが開始する場合は「解」を表示しない（パターン分割の翌日再開は真の解約ではない）
  const buildCancelMap = (patterns: any[], start?: string, end?: string) => {
    const map = new Map<string, Set<string>>();
    const inRange = (dateStr: string) => {
      if (!start || !end) return true;
      return dateStr >= start && dateStr <= end;
    };
    patterns.forEach((p: any) => {
      const endDate = p?.end_date;
      const productId = p?.product_id;
      const customerId = p?.customer_id;
      // end_date があるものは翌日に「解」を検討
      if (!endDate || !productId || !customerId) return;
      const d = new Date(endDate);
      d.setDate(d.getDate() + 1);
      const cancelDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      // 翌日に同一商品の新パターン（is_active=1）が開始するなら「解」を抑止
      const nextActiveExists = patterns.some((q: any) => (
        q.customer_id === customerId &&
        q.product_id === productId &&
        Number(q.is_active) === 1 &&
        q.start_date === cancelDate
      ));
      if (nextActiveExists) return;
      if (!inRange(cancelDate)) return;
      const key = `${cancelDate}-${customerId}`;
      const set = map.get(key) || new Set<string>();
      set.add(String(productId));
      map.set(key, set);
    });
    return map;
  };


  // 配達データを取得する関数
  const fetchDeliveryData = useCallback(async () => {
    if (!startDate || days <= 0) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = calculateEndDate(startDate, days);
      // 『全コース（コース別）』は期間APIでは『全コース』として扱う
      const courseParam = (selectedCourse === 'all' || selectedCourse === 'all-by-course') ? '' : `&courseId=${selectedCourse}`;
      const response = await fetch(`/api/delivery/period?startDate=${startDate}&endDate=${endDate}${courseParam}`);
      
      if (!response.ok) {
        throw new Error('配達データの取得に失敗しました');
      }

      const data = await response.json();
      const deliveries = data.deliveries || {};
      // 休配反映用に臨時変更を取得（対象顧客のみ）
      const customerIdSet = new Set<number>();
      Object.values(deliveries as Record<string, any>).forEach((courseData: any) => {
        const dayArrays = Object.values(courseData as Record<string, any>) as any[];
        dayArrays.forEach((dayData: any) => {
          const customers = dayData as any[];
          customers.forEach((customer: any) => {
            if (customer && typeof customer.customer_id === 'number') {
              customerIdSet.add(customer.customer_id);
            }
          });
        });
      });
      // 選択コースの顧客も対象に含める（期間中に配達がない顧客の臨時追加を拾うため）
      // 選択コースに属する顧客のIDと custom_id（7桁）を取得
      const fetchCustomerIdsBySelection = async (): Promise<{ ids: number[]; idToCustomId: Map<number, string> }> => {
        try {
          // 『全コース（コース別）』も全顧客対象として扱う（期間中に配達がない顧客の臨時追加を拾うため）
          if (selectedCourse === 'all' || selectedCourse === 'all-by-course') {
            const res = await fetch('/api/customers');
            if (!res.ok) throw new Error('顧客一覧の取得に失敗しました');
            const rows = await res.json();
            if (!Array.isArray(rows)) return { ids: [], idToCustomId: new Map<number, string>() };
            const idToCustomId = new Map<number, string>();
            rows.forEach((r: any) => {
              const idNum = Number(r.id);
              if (Number.isFinite(idNum)) {
                idToCustomId.set(idNum, String(r.custom_id || ''));
              }
            });
            const ids = rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n));
            return { ids, idToCustomId };
          } else {
            const res = await fetch(`/api/customers/by-course/${selectedCourse}`);
            if (!res.ok) throw new Error('コース別顧客一覧の取得に失敗しました');
            const rows = await res.json();
            if (!Array.isArray(rows)) return { ids: [], idToCustomId: new Map<number, string>() };
            const idToCustomId = new Map<number, string>();
            rows.forEach((r: any) => {
              const idNum = Number(r.id);
              if (Number.isFinite(idNum)) {
                idToCustomId.set(idNum, String(r.custom_id || ''));
              }
            });
            const ids = rows.map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n));
            return { ids, idToCustomId };
          }
        } catch (e) {
          console.warn('顧客一覧の取得に失敗しました（臨時変更の対象拡張は一部スキップされます）:', e);
          return { ids: [], idToCustomId: new Map<number, string>() };
        }
      };
      const { ids: extraIds, idToCustomId } = await fetchCustomerIdsBySelection();
      extraIds.forEach(id => customerIdSet.add(id));
      // 期間内に登場する顧客（＋選択コースの全顧客）について、7桁IDマップを完全化する
      const ensureCustomIdsFor = async (customerIds: number[], baseMap: Map<number, string>): Promise<Map<number, string>> => {
        const localMap = new Map<number, string>(Array.from(baseMap.entries()));
        const toFetch: number[] = [];
        customerIds.forEach((cid) => {
          const existing = localMap.get(cid);
          if (!existing || existing.length !== 7) {
            toFetch.push(cid);
          }
        });
        if (toFetch.length === 0) return localMap;
        // 顧客詳細APIで custom_id を取得（詳細画面と同じソースを信頼する）
        const results = await Promise.all(
          toFetch.map(async (cid) => {
            try {
              const res = await fetch(`/api/customers/${cid}`);
              if (!res.ok) return { cid, custom_id: '' };
              const json = await res.json();
              const customId = String(json?.customer?.custom_id || json?.custom_id || '').trim();
              return { cid, custom_id: customId };
            } catch {
              return { cid, custom_id: '' };
            }
          })
        );
        results.forEach(({ cid, custom_id }) => {
          if (custom_id && custom_id.length === 7) {
            localMap.set(cid, custom_id);
          }
        });
        return localMap;
      };
      const idToCustomIdLocal = await ensureCustomIdsFor(Array.from(customerIdSet), idToCustomId);
      // state に反映（UI はこの値を使用して 7桁ID を表示）
      setIdToCustomIdMap(idToCustomIdLocal);
      const changes = await fetchTemporaryChangesInRange(startDate, endDate, Array.from(customerIdSet));
      const newSkipMap = buildSkipMap(changes);
      setSkipMap(newSkipMap);
      // 解約マーカー用に配達パターンを取得
      const { patterns, map: patternsMapLocal } = await fetchDeliveryPatternsByCustomers(Array.from(customerIdSet));
      const newCancelMap = buildCancelMap(patterns, startDate, endDate);
      setCancelMap(newCancelMap);
      // 臨時追加・本数変更の反映
      const addMap = new Map<string, any[]>();
      const modifyMap = new Map<string, any[]>();
      changes.forEach((c: any) => {
        const key = `${c.change_date}-${c.customer_id}`;
        if (c.change_type === 'add') {
          const arr = addMap.get(key) || [];
          arr.push(c);
          addMap.set(key, arr);
        } else if (c.change_type === 'modify') {
          const arr = modifyMap.get(key) || [];
          arr.push(c);
          modifyMap.set(key, arr);
        }
      });

      const findCourseNameForCustomer = (custId: number): string | null => {
        for (const [courseName, courseData] of Object.entries(deliveries as Record<string, any>)) {
          const dayArrays = Object.values(courseData as Record<string, any>) as any[];
          for (const dayData of dayArrays) {
            const customers = dayData as any[];
            for (const customer of customers) {
              if (customer && customer.customer_id === custId) return courseName;
            }
          }
        }
        return null;
      };

      const getCourseNameForCustomerByApi = async (custId: number): Promise<string | null> => {
        try {
          const res = await fetch(`/api/customers/${custId}`);
          if (!res.ok) return null;
          const json = await res.json();
          // /api/customers/:id は { customer: { course_name, ... }, patterns: [...] } の形で返却される
          const courseName = (json && json.customer && typeof json.customer.course_name === 'string')
            ? json.customer.course_name
            : (typeof json?.course_name === 'string' ? json.course_name : null);
          return courseName || null;
        } catch {
          return null;
        }
      };

      const getExistingCustomerSample = (courseName: string, custId: number): any | null => {
        const courseData: any = deliveries[courseName];
        if (!courseData) return null;
        const dayArrays = Object.values(courseData as Record<string, any>) as any[];
        for (const dayData of dayArrays) {
          const customers = dayData as any[];
          for (const customer of customers) {
            if (customer && customer.customer_id === custId) return customer;
          }
        }
        return null;
      };

      const ensureCustomerAtDate = (courseName: string, date: string, custId: number): any => {
        const courseData: any = deliveries[courseName] || (deliveries[courseName] = {});
        const customersArr: any[] = courseData[date] || (courseData[date] = []);
        let customer = customersArr.find((c: any) => c.customer_id === custId);
        if (!customer) {
          const sample = getExistingCustomerSample(courseName, custId);
          customer = {
            customer_id: custId,
            customer_name: sample?.customer_name || `顧客${custId}`,
            address: sample?.address || '',
            phone: sample?.phone || '',
            delivery_order: sample?.delivery_order || null,
            products: []
          };
          customersArr.push(customer);
        }
        return customer;
      };

      const ensureProductOnCustomer = (customer: any, change: any, patternMapOverride?: Map<string, any>) => {
        const pid = Number(change.product_id);
        let product = (customer.products || []).find((p: any) => p.product_id === pid);
        if (!product) {
          const patKey = `${customer.customer_id}-${pid}`;
          const patSource = patternMapOverride || patternsMap;
          const pat = patSource.get(patKey);
          product = {
            product_id: pid,
            product_name: pat?.product_name || change.product_name || `商品${pid}`,
            manufacturer_id: (pat?.manufacturer_id !== undefined && pat?.manufacturer_id !== null) ? Number(pat.manufacturer_id) : ((change.manufacturer_id !== undefined && change.manufacturer_id !== null) ? Number(change.manufacturer_id) : undefined),
            manufacturer_name: pat?.manufacturer_name || change.manufacturer_name || '',
            unit: pat?.unit || change.unit || '',
            quantity: 0,
            unit_price: pat?.unit_price || change.unit_price || 0,
            amount: 0
          };
          customer.products = customer.products || [];
          customer.products.push(product);
        } else {
          // 既存製品にメーカー情報が欠けている場合は補完
          if ((product as any).manufacturer_id === undefined) {
            const patKey = `${customer.customer_id}-${pid}`;
            const patSource = patternMapOverride || patternsMap;
            const pat = patSource.get(patKey);
            if (pat?.manufacturer_id !== undefined && pat?.manufacturer_id !== null) {
              (product as any).manufacturer_id = Number(pat.manufacturer_id);
            } else if (change.manufacturer_id !== undefined && change.manufacturer_id !== null) {
              (product as any).manufacturer_id = Number(change.manufacturer_id);
            }
          }
          if (!product.manufacturer_name) {
            const patKey = `${customer.customer_id}-${pid}`;
            const patSource = patternMapOverride || patternsMap;
            const pat = patSource.get(patKey);
            product.manufacturer_name = pat?.manufacturer_name || change.manufacturer_name || product.manufacturer_name || '';
          }
        }
        return product;
      };

      // modifyを先に適用（既存商品がある前提）。なければ追加として扱う
      const modifyEntries = Array.from(modifyMap.entries());
      for (let i = 0; i < modifyEntries.length; i++) {
        const [key, mods] = modifyEntries[i];
        const sepIdx = key.lastIndexOf('-');
        const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
        const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
        const cid = Number(cidStr);
        let courseName = findCourseNameForCustomer(cid);
        if (!courseName) {
          courseName = await getCourseNameForCustomerByApi(cid);
        }
        if (!courseName) continue;
        const customer = ensureCustomerAtDate(courseName, date, cid);
        mods.forEach((m: any) => {
          const product = ensureProductOnCustomer(customer, m, patternsMapLocal);
          const qty = Number(m.quantity || 0);
          const price = Number(m.unit_price || product.unit_price || 0);
          product.quantity = qty;
          product.unit_price = price;
          product.amount = qty * price;
        });
      }

      // addの適用（存在しない商品を追加）
      const addEntries = Array.from(addMap.entries());
      for (let i = 0; i < addEntries.length; i++) {
        const [key, adds] = addEntries[i];
        const sepIdx = key.lastIndexOf('-');
        const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
        const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
        const cid = Number(cidStr);
        let courseName = findCourseNameForCustomer(cid);
        if (!courseName) {
          courseName = await getCourseNameForCustomerByApi(cid);
        }
        if (!courseName) continue;
        const customer = ensureCustomerAtDate(courseName, date, cid);
        adds.forEach((a: any) => {
          const product = ensureProductOnCustomer(customer, a, patternsMapLocal);
          const qty = Number(a.quantity || 0);
          const price = Number(a.unit_price || product.unit_price || 0);
          product.quantity = qty;
          product.unit_price = price;
          product.amount = qty * price;
        });
      }

      // 変更を反映したデータを保存
      setDeliveryData(deliveries);
      // 休配を反映した総数量を再計算
      let totalQty = 0;
      Object.entries(deliveries).forEach(([courseName, courseData]: [string, any]) => {
        Object.entries(courseData).forEach(([date, customers]: [string, any]) => {
          customers.forEach((customer: any) => {
            (customer.products || []).forEach((product: any) => {
              const skipped = (() => {
                const key = `${date}-${customer.customer_id}`;
                const set = newSkipMap.get(key);
                if (!set) return false;
                if (set.has('ALL')) return true;
                return set.has(String(product.product_id));
              })();
              const qty = skipped ? 0 : (product.quantity || 0);
              totalQty += qty;
            });
          });
        });
      });
      setDeliverySummary({ ...data.summary, total_quantity: totalQty });
    } catch (err) {
      console.error('配達データ取得エラー:', err);
      setError(err instanceof Error ? err.message : '配達データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [startDate, days, selectedCourse, calculateEndDate]);

  // 手動集計ボタンのハンドラー（未使用のため削除）

  // autoFetchの状態をローカルストレージに保存（配達リストタブ用）
  useEffect(() => {
    localStorage.setItem('deliveryListTab_autoFetch', JSON.stringify(autoFetch));
  }, [autoFetch]);

  // 初回読み込み（自動取得が有効な場合のみ）
  useEffect(() => {
    fetchCourses(); // コース一覧を取得
    if (autoFetch) {
      fetchDeliveryData();
    }
  }, [fetchCourses, fetchDeliveryData, autoFetch]);

  // 今日の日付に設定
  const handleToday = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(1);
  };

  // 期間を1週間に設定
  const handleWeek = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(7);
  };

  // 日付変更時の処理
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  // 日数変更時の処理
  const handleDaysChange = (value: number) => {
    if (value > 0 && value <= 365) { // 1日以上365日以下の制限
      setDays(value);
    }
  };

  // コース変更時の処理
  const handleCourseChange = (value: string) => {
    setSelectedCourse(value);
  };

  return (
    <Box>
      {/* 期間・コース選択 */}
      <Card sx={{ mb: 3 }} className="print-header-hide">
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                label="開始日"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="日数"
                type="number"
                value={days}
                onChange={(e) => handleDaysChange(parseInt(e.target.value) || 1)}
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
                  onChange={(e) => handleCourseChange(e.target.value)}
                >
                  <MenuItem value="all">全コース（合計）</MenuItem>
                  <MenuItem value="all-by-course">全コース（コース別）</MenuItem>
                  {courses && courses.length > 0 ? courses.map((course) => (
                    <MenuItem key={course.id} value={course.id?.toString() || ''}>
                      {course.course_name || `コース${course.id}`}
                    </MenuItem>
                  )) : null}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={handleToday} size="small">
                  今日
                </Button>
                <Button variant="outlined" onClick={handleWeek} size="small">
                  1週間
                </Button>
              </Box>
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            {/* 左側：集計ボタンとシンプル表示チェックボックス */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                onClick={fetchDeliveryData}
                disabled={loading || !startDate || days <= 0}
                startIcon={loading ? <CircularProgress size={20} /> : undefined}
              >
                {loading ? '集計中...' : '集計'}
              </Button>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={autoFetch}
                    onChange={(e) => setAutoFetch(e.target.checked)}
                    size="small"
                  />
                }
                label="自動集計"
                sx={{ ml: 1 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSimpleDisplay}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setIsSimpleDisplay(newValue);
                      localStorage.setItem('deliveryList_simpleDisplay', JSON.stringify(newValue));
                    }}
                    size="small"
                  />
                }
                label="シンプル表示"
                sx={{ ml: 1 }}
              />
            </Box>

            {/* 右側：出力ボタン */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<Print />}
                disabled={!deliveryData || Object.keys(deliveryData).length === 0}
                onClick={() => window.print()}
              >
                印刷
              </Button>
            <Button
              variant="outlined"
              startIcon={<GetApp />}
              disabled={!deliveryData || Object.keys(deliveryData).length === 0}
              onClick={handleCsvExport}
            >
              CSV出力
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdf />}
              disabled={!deliveryData || Object.keys(deliveryData).length === 0}
              onClick={handleDeliveryListPdfExport}
            >
              PDF出力
            </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ローディング表示 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* エラー表示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* 配達データ表示 */}
      {!loading && !error && deliveryData && Object.keys(deliveryData).length > 0 && (
        <div id="delivery-list-content">
        <>
          {/* 期間表示 */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            配達期間: {startDate} ～ {calculateEndDate(startDate, days)} ({days}日間)
          </Typography>

          {/* 統計情報 */}
          {deliverySummary && (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                総顧客数: {(() => {
                  // 全コースの全日付からユニークな顧客IDを抽出
                  const allUniqueCustomers = new Set();
                  Object.values(deliveryData as Record<string, any>).forEach((courseData: any) => {
                    Object.values(courseData as Record<string, any>).forEach((dayData: any) => {
                      dayData.forEach((customer: any) => {
                        allUniqueCustomers.add(customer.customer_id);
                      });
                    });
                  });
                  return allUniqueCustomers.size;
                })()}件 | 
                総数量: {deliverySummary.total_quantity}
              </Typography>
            </Box>
          )}

          {/* コース別配達リスト */}
          {Object.keys(deliveryData).length > 0 ? (
            Object.entries(deliveryData).map(([courseName, courseData]: [string, any]) => {
              // コース内のユニークな顧客数を計算
              const uniqueCustomers = new Set();
              Object.values(courseData as Record<string, any>).forEach((dayData: any) => {
                dayData.forEach((customer: any) => {
                  uniqueCustomers.add(customer.customer_id);
                });
              });
              const totalCustomers = uniqueCustomers.size;

              // 全ての日付を取得してソート
              const allDates = Object.keys(courseData).sort();
              
              // 期間内に実際の配達があった顧客×商品を先に抽出（休配は除外）
              const productsWithDelivery = new Set<string>();
              allDates.forEach(date => {
                const customers = courseData[date];
                customers.forEach((customer: any) => {
                  customer.products?.forEach((product: any) => {
                    const skipped = isSkipped(date, customer.customer_id, product.product_id);
                    const qty = product.quantity || 0;
                    if (!skipped && qty > 0) {
                      productsWithDelivery.add(`${customer.customer_id}-${product.product_id}`);
                    }
                  });
                });
              });

              // 全ての顧客と商品を統合し、顧客×商品ごとに日付別のデータを整理
              const customerProductMap = new Map();
              
              allDates.forEach(date => {
                const customers = courseData[date];
                customers.forEach((customer: any) => {
                  customer.products?.forEach((product: any) => {
                    const key = `${customer.customer_id}-${product.product_id}`;
                    if (!customerProductMap.has(key)) {
                      customerProductMap.set(key, {
                        customer_id: customer.customer_id,
                        // サーバから渡された custom_id を優先、なければ Map から補完
                        custom_id: (customer.custom_id && String(customer.custom_id).length === 7)
                          ? String(customer.custom_id)
                          : (idToCustomIdMap.get(customer.customer_id) || null),
                        customer_name: customer.customer_name,
                        address: customer.address,
                        phone: customer.phone,
                        delivery_order: customer.delivery_order,
                        product_id: product.product_id,
                        product_name: product.product_name,
                        dateQuantities: {}
                      });
                    }
                    
                    const customerProductData = customerProductMap.get(key);
                    customerProductData.dateQuantities[date] = product.quantity;
                  });

                  // その日が「解」対象なら、存在しない商品行も追加する
                  const cancelKey = `${date}-${customer.customer_id}`;
                  const cancelledSet = cancelMap.get(cancelKey);
                  if (cancelledSet && cancelledSet.size > 0) {
                    cancelledSet.forEach((pidStr: string) => {
                      const pid = Number(pidStr);
                      const cKey = `${customer.customer_id}-${pid}`;
                      // 期間内に実際の配達があった商品に限って「解」行を補完
                      if (!productsWithDelivery.has(cKey)) {
                        return; // 実配達がない商品は補完しない（「解」も表示しない）
                      }
                        if (!customerProductMap.has(cKey)) {
                          const pat = patternsMap.get(cKey);
                          customerProductMap.set(cKey, {
                          customer_id: customer.customer_id,
                          // サーバの値優先 + Map 補完
                          custom_id: (customer.custom_id && String(customer.custom_id).length === 7)
                            ? String(customer.custom_id)
                            : (idToCustomIdMap.get(customer.customer_id) || null),
                          customer_name: customer.customer_name,
                          address: customer.address,
                          phone: customer.phone,
                          delivery_order: customer.delivery_order,
                          product_id: pid,
                          product_name: pat?.product_name || `商品${pid}`,
                          dateQuantities: { [date]: 0 }
                          });
                        } else {
                          const cp = customerProductMap.get(cKey);
                          if (cp && cp.dateQuantities[date] === undefined) {
                            cp.dateQuantities[date] = 0;
                          }
                        }
                    });
                  }
                });
              });

              const allCustomerProducts = Array.from(customerProductMap.values()).sort((a, b) => {
                const orderA = a.delivery_order || 999;
                const orderB = b.delivery_order || 999;
                if (orderA !== orderB) return orderA - orderB;
                return a.customer_id - b.customer_id;
              });
              
              return (
                <Accordion key={courseName} defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography variant="h6" color="primary">
                      {courseName} ({totalCustomers}件)
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper}>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>配達順</TableCell>
                            <TableCell>ID（7桁）</TableCell>
                            <TableCell sx={{ minWidth: isSimpleDisplay ? 150 : 120 }}>顧客名</TableCell>
                            {!isSimpleDisplay && <TableCell>住所</TableCell>}
                            {!isSimpleDisplay && <TableCell>電話番号</TableCell>}
                            <TableCell sx={{ minWidth: isSimpleDisplay ? 120 : 100 }}>商品名</TableCell>
                            {allDates.map(date => (
                              <TableCell key={date} align="center" sx={{ minWidth: 80 }}>
                                {date}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {allCustomerProducts.map((customerProduct: any, index: number) => {
                            // 同じ顧客の最初の商品かどうかを判定
                            const isFirstProductForCustomer = index === 0 || 
                              allCustomerProducts[index - 1].customer_id !== customerProduct.customer_id;
                            
                            return (
                              <TableRow key={`${customerProduct.customer_id}-${customerProduct.product_id}`}>
                                <TableCell>
                                  {isFirstProductForCustomer ? (customerProduct.delivery_order || '-') : ''}
                                </TableCell>
                                <TableCell>
                                  {isFirstProductForCustomer ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                      <Box
                                        component="button"
                                        onClick={() => {
                                          const url = `${window.location.origin}/customers/${customerProduct.customer_id}?view=standalone`;
                                          window.open(
                                            url,
                                            'customer-detail',
                                            'noopener,noreferrer,width=1080,height=720,scrollbars=yes,resizable=yes,location=no,menubar=no,toolbar=no,status=no,titlebar=no'
                                          );
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          padding: 0,
                                          margin: 0,
                                          color: '#1976d2',
                                          textDecoration: 'underline',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        {pad7(customerProduct.custom_id)}
                                      </Box>
                                    </Box>
                                  ) : ''}
                                </TableCell>
                                <TableCell sx={{ fontWeight: isSimpleDisplay ? 'bold' : 'normal' }}>
                                  {isFirstProductForCustomer ? customerProduct.customer_name : ''}
                                </TableCell>
                                {!isSimpleDisplay && (
                                  <TableCell>
                                    {isFirstProductForCustomer ? customerProduct.address : ''}
                                  </TableCell>
                                )}
                                {!isSimpleDisplay && (
                                  <TableCell>
                                    {isFirstProductForCustomer ? customerProduct.phone : ''}
                                  </TableCell>
                                )}
                                <TableCell sx={{ fontWeight: isSimpleDisplay ? 'bold' : 'normal' }}>
                                  {customerProduct.product_name}
                                </TableCell>
                                {allDates.map(date => {
                                  const quantity = customerProduct.dateQuantities[date];
                                  const skipped = isSkipped(date, customerProduct.customer_id, customerProduct.product_id);
                                  const cancelled = isCancelled(date, customerProduct.customer_id, customerProduct.product_id);
                                  return (
                                    <TableCell key={date} align="center">
                                      {skipped ? (
                                        <Chip label="休" size="small" sx={{ bgcolor: '#ffebee', color: 'red', border: '1px solid #ffcdd2' }} />
                                      ) : cancelled ? (
                                        <Chip label="解" size="small" sx={{ bgcolor: '#fdecea', color: '#d32f2f', border: '1px solid #f8d7da' }} />
                                      ) : quantity ? (
                                        <Typography variant="body2" fontWeight="bold">
                                          {quantity}
                                        </Typography>
                                      ) : (
                                        <Typography variant="body2" color="text.disabled">
                                          -
                                        </Typography>
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              );
            })
          ) : (
            <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
              <LocalShipping sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                指定された期間・コースの配達予定はありません
              </Typography>
            </Paper>
          )}
        </>
        </div>
      )}

      {/* データが未取得の場合の表示 */}
      {!loading && !error && !deliveryData && (
        <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            期間とコースを選択して「集計」ボタンをクリックしてください
          </Typography>
          <Typography variant="body2" color="text.secondary">
            配達リストを表示するには集計処理が必要です
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

// 商品合計表タブのコンポーネント
const ProductSummaryTab: React.FC = () => {
  // 今日の日付を取得してフォーマット（日本標準時）
  const getTodayString = (): string => {
    const today = new Date();
    const jstOffset = 9 * 60;
    const jstTime = new Date(today.getTime() + (jstOffset * 60 * 1000));
    return jstTime.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(getTodayString());
  const [days, setDays] = useState<number>(1);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [skipMap, setSkipMap] = useState<Map<string, Set<string>>>(new Map());
  const [patternsMap, setPatternsMap] = useState<Map<string, any>>(new Map());
  const [summaryRows, setSummaryRows] = useState<any[]>([]);
  const [summaryDateList, setSummaryDateList] = useState<string[]>([]);
  const [autoFetch, setAutoFetch] = useState<boolean>(() => {
    const saved = localStorage.getItem('productSummaryTab_autoFetch');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // メーカー別グループ化のトグル
  const [groupByManufacturer, setGroupByManufacturer] = useState<boolean>(() => {
    const saved = localStorage.getItem('productSummaryTab_groupByManufacturer');
    return saved !== null ? JSON.parse(saved) : false;
  });
  // 総金額表示のトグル（デフォルトは表示）
  const [showTotalAmount, setShowTotalAmount] = useState<boolean>(() => {
    const saved = localStorage.getItem('productSummaryTab_showTotalAmount');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // メーカー絞り込み（複数選択）
  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>(() => {
    const saved = localStorage.getItem('productSummaryTab_selectedManufacturers');
    return saved !== null ? JSON.parse(saved) : [];
  });

  const calculateEndDate = useCallback((start: string, dayCount: number): string => {
    const startDateObj = new Date(start);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + dayCount - 1);
    return endDateObj.toISOString().split('T')[0];
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch('/api/masters/courses');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setCourses(data);
    } catch (error: any) {
      console.error('コース一覧の取得エラー:', error);
    }
  }, []);

  const fetchTemporaryChangesInRange = async (start: string, end: string, customerIds: number[]) => {
    try {
      if (customerIds.length === 0) return [];
      const response = await axios.get(`/api/temporary-changes/batch/period/${start}/${end}`, {
        params: { customerIds: customerIds.join(',') }
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (e) {
      console.warn('臨時変更データの一括取得でエラー。休配reflectはスキップされます:', e);
      return [];
    }
  };

  const buildSkipMap = (changes: any[]) => {
    const map = new Map<string, Set<string>>();
    changes.filter(c => c.change_type === 'skip').forEach((c: any) => {
      const key = `${c.change_date}-${c.customer_id}`;
      const set = map.get(key) || new Set<string>();
      if (c.product_id && Number.isFinite(Number(c.product_id))) {
        set.add(String(c.product_id));
      } else {
        set.add('ALL');
      }
      map.set(key, set);
    });
    return map;
  };

  const fetchDeliveryPatternsByCustomers = async (customerIds: number[]) => {
    try {
      const patterns: any[] = [];
      const batchSize = 10;
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize);
        const requests = batch.map((cid) => (
          axios.get(`/api/delivery-patterns/customer/${cid}`)
            .then((res) => Array.isArray(res.data) ? res.data.map((r: any) => ({ ...r, customer_id: typeof r.customer_id === 'number' ? r.customer_id : cid })) : [])
            .catch((err) => {
              console.warn(`顧客ID ${cid} の配達パターン取得に失敗しました`, err);
              return [];
            })
        ));
        const results = await Promise.allSettled(requests);
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            patterns.push(...r.value);
          }
        });
      }
      const map = new Map<string, any>();
      patterns.forEach((p: any) => {
        const key = `${p.customer_id}-${p.product_id}`;
        map.set(key, p);
      });
      setPatternsMap(map);
      return { patterns, map };
    } catch (e) {
      console.warn('配達パターンデータの取得で予期せぬエラー:', e);
      return { patterns: [], map: new Map<string, any>() };
    }
  };

  const ensureCustomerAtDate = (deliveries: any, courseName: string, date: string, custId: number, sample?: any): any => {
    const courseData: any = deliveries[courseName] || (deliveries[courseName] = {});
    const customersArr: any[] = courseData[date] || (courseData[date] = []);
    let customer = customersArr.find((c: any) => c.customer_id === custId);
    if (!customer) {
      customer = {
        customer_id: custId,
        customer_name: sample?.customer_name || `顧客${custId}`,
        address: sample?.address || '',
        phone: sample?.phone || '',
        delivery_order: sample?.delivery_order || null,
        products: []
      };
      customersArr.push(customer);
    }
    return customer;
  };

  const ensureProductOnCustomer = (customer: any, change: any, patternMapOverride?: Map<string, any>) => {
    const pid = Number(change.product_id);
    let product = (customer.products || []).find((p: any) => p.product_id === pid);
    if (!product) {
      const patKey = `${customer.customer_id}-${pid}`;
      const patSource = patternMapOverride || patternsMap;
      const pat = patSource.get(patKey);
      product = {
        product_id: pid,
        product_name: pat?.product_name || change.product_name || `商品${pid}`,
        manufacturer_id: (pat?.manufacturer_id !== undefined && pat?.manufacturer_id !== null) ? Number(pat.manufacturer_id) : ((change.manufacturer_id !== undefined && change.manufacturer_id !== null) ? Number(change.manufacturer_id) : undefined),
        manufacturer_name: pat?.manufacturer_name || change.manufacturer_name || '',
        unit: pat?.unit || change.unit || '',
        quantity: 0,
        unit_price: pat?.unit_price || change.unit_price || 0,
        amount: 0
      };
      customer.products = customer.products || [];
      customer.products.push(product);
    }
    return product;
  };

  const fetchSummaryData = useCallback(async () => {
    if (!startDate || days <= 0) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = calculateEndDate(startDate, days);
      const courseParam = (selectedCourse === 'all' || selectedCourse === 'all-by-course') ? '' : `&courseId=${selectedCourse}`;
      const response = await fetch(`/api/delivery/period?startDate=${startDate}&endDate=${endDate}${courseParam}`);
      if (!response.ok) {
        throw new Error('配達データの取得に失敗しました');
      }
      const data = await response.json();
      const deliveries = data.deliveries || {};

      // 対象顧客の抽出
      const customerIdSet = new Set<number>();
      Object.values(deliveries as Record<string, any>).forEach((courseData: any) => {
        const dayArrays = Object.values(courseData as Record<string, any>) as any[];
        dayArrays.forEach((dayData: any) => {
          const customers = dayData as any[];
          customers.forEach((customer: any) => {
            if (customer && typeof customer.customer_id === 'number') {
              customerIdSet.add(customer.customer_id);
            }
          });
        });
      });

      // 臨時変更データ取得
      const changes = await fetchTemporaryChangesInRange(startDate, endDate, Array.from(customerIdSet));
      const newSkipMap = buildSkipMap(changes);
      setSkipMap(newSkipMap);
      const { patterns, map: patternsMapLocal } = await fetchDeliveryPatternsByCustomers(Array.from(customerIdSet));

      // 臨時追加・本数変更の反映
      const addMap = new Map<string, any[]>();
      const modifyMap = new Map<string, any[]>();
      changes.forEach((c: any) => {
        const key = `${c.change_date}-${c.customer_id}`;
        if (c.change_type === 'add') {
          const arr = addMap.get(key) || [];
          arr.push(c);
          addMap.set(key, arr);
        } else if (c.change_type === 'modify') {
          const arr = modifyMap.get(key) || [];
          arr.push(c);
          modifyMap.set(key, arr);
        }
      });

      const findCourseNameForCustomer = (custId: number): string | null => {
        for (const [courseName, courseData] of Object.entries(deliveries as Record<string, any>)) {
          const dayArrays = Object.values(courseData as Record<string, any>) as any[];
          for (const dayData of dayArrays) {
            const customers = dayData as any[];
            for (const customer of customers) {
              if (customer && customer.customer_id === custId) return courseName as string;
            }
          }
        }
        return null;
      };

      const getCourseNameForCustomerByApi = async (custId: number): Promise<string | null> => {
        try {
          const res = await fetch(`/api/customers/${custId}`);
          if (!res.ok) return null;
          const json = await res.json();
          const courseName = (json && json.customer && typeof json.customer.course_name === 'string')
            ? json.customer.course_name
            : (typeof json?.course_name === 'string' ? json.course_name : null);
          return courseName || null;
        } catch {
          return null;
        }
      };

      const getExistingCustomerSample = (courseName: string, custId: number): any | null => {
        const courseData: any = deliveries[courseName];
        if (!courseData) return null;
        const dayArrays = Object.values(courseData as Record<string, any>) as any[];
        for (const dayData of dayArrays) {
          const customers = dayData as any[];
          for (const customer of customers) {
            if (customer && customer.customer_id === custId) return customer;
          }
        }
        return null;
      };

      // modify を適用
      for (const [key, mods] of Array.from(modifyMap.entries())) {
        const sepIdx = key.lastIndexOf('-');
        const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
        const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
        const cid = Number(cidStr);
        let courseName = findCourseNameForCustomer(cid);
        if (!courseName) {
          courseName = await getCourseNameForCustomerByApi(cid);
        }
        if (!courseName) continue;
        const sample = getExistingCustomerSample(courseName, cid);
        const customer = ensureCustomerAtDate(deliveries, courseName, date, cid, sample || undefined);
        mods.forEach((m: any) => {
          const product = ensureProductOnCustomer(customer, m, patternsMapLocal);
          const qty = Number(m.quantity || 0);
          const price = Number(m.unit_price || product.unit_price || 0);
          product.quantity = qty;
          product.unit_price = price;
          product.amount = qty * price;
        });
      }

      // add を適用
      for (const [key, adds] of Array.from(addMap.entries())) {
        const sepIdx = key.lastIndexOf('-');
        const date = sepIdx >= 0 ? key.substring(0, sepIdx) : key;
        const cidStr = sepIdx >= 0 ? key.substring(sepIdx + 1) : '';
        const cid = Number(cidStr);
        let courseName = findCourseNameForCustomer(cid);
        if (!courseName) {
          courseName = await getCourseNameForCustomerByApi(cid);
        }
        if (!courseName) continue;
        const sample = getExistingCustomerSample(courseName, cid);
        const customer = ensureCustomerAtDate(deliveries, courseName, date, cid, sample || undefined);
        adds.forEach((a: any) => {
          const product = ensureProductOnCustomer(customer, a, patternsMapLocal);
          const qty = Number(a.quantity || 0);
          const price = Number(a.unit_price || product.unit_price || 0);
          product.quantity = qty;
          product.unit_price = price;
          product.amount = qty * price;
        });
      }

      // 期間内の日付リストを生成
      const dateList: string[] = [];
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
        dateList.push(d.toISOString().split('T')[0]);
      }

      // 集計（商品別・日別）
      const summaryMap = new Map<number, any>();
      Object.entries(deliveries).forEach(([courseName, courseData]: [string, any]) => {
        Object.entries(courseData).forEach(([date, customers]: [string, any]) => {
          (customers as any[]).forEach((customer: any) => {
            (customer.products || []).forEach((product: any) => {
              const skipped = (() => {
                const key = `${date}-${customer.customer_id}`;
                const set = newSkipMap.get(key);
                if (!set) return false;
                if (set.has('ALL')) return true;
                return set.has(String(product.product_id));
              })();
              const qty = skipped ? 0 : Number(product.quantity || 0);
              const amount = skipped ? 0 : Number(product.amount || (qty * Number(product.unit_price || 0)));
              
              const existing = summaryMap.get(product.product_id);
              if (!existing) {
                const dailyQuantities: Record<string, number> = {};
                dateList.forEach(d => dailyQuantities[d] = 0);
                dailyQuantities[date] = qty;
                summaryMap.set(product.product_id, {
                  product_id: product.product_id,
                  product_name: product.product_name,
                  manufacturer_name: product.manufacturer_name || '',
                  unit: product.unit || '',
                  daily_quantities: dailyQuantities,
                  total_quantity: qty,
                  total_amount: amount,
                  unit_price: product.unit_price || 0
                });
              } else {
                existing.daily_quantities[date] = (existing.daily_quantities[date] || 0) + qty;
                existing.total_quantity += qty;
                existing.total_amount += amount;
              }
            });
          });
        });
      });

      // 日付リストも保存（テーブル表示用）
      const rows = Array.from(summaryMap.values()).sort((a, b) => {
        // 商品名でソート
        return String(a.product_name).localeCompare(String(b.product_name));
      });
      setSummaryRows(rows);
      setSummaryDateList(dateList);
    } catch (err) {
      console.error('商品合計データ取得エラー:', err);
      setError(err instanceof Error ? err.message : '商品合計データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [startDate, days, selectedCourse, calculateEndDate]);

  useEffect(() => {
    localStorage.setItem('productSummaryTab_autoFetch', JSON.stringify(autoFetch));
  }, [autoFetch]);

  // メーカー別グループ化状態の保存
  useEffect(() => {
    localStorage.setItem('productSummaryTab_groupByManufacturer', JSON.stringify(groupByManufacturer));
  }, [groupByManufacturer]);
  // メーカー絞り込みの保存
  useEffect(() => {
    localStorage.setItem('productSummaryTab_selectedManufacturers', JSON.stringify(selectedManufacturers));
  }, [selectedManufacturers]);

  useEffect(() => {
    fetchCourses();
    if (autoFetch) {
      fetchSummaryData();
    }
  }, [fetchCourses, fetchSummaryData, autoFetch]);

  const handleToday = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(1);
  };
  const handleWeek = () => {
    const today = getTodayString();
    setStartDate(today);
    setDays(7);
  };
  const handleStartDateChange = (value: string) => setStartDate(value);
  const handleDaysChange = (value: number) => { if (value > 0 && value <= 31) setDays(value); };
  const handleCourseChange = (value: string) => setSelectedCourse(value);

  // メーカー別グループ化した配列の算出
  const manufacturerGroups = useMemo(() => {
    const map = new Map<string, { manufacturer_name: string; rows: any[]; subtotal_quantity: number; subtotal_amount: number }>();
    (summaryRows || []).forEach((r: any) => {
      const key = r.manufacturer_name || '不明メーカー';
      const existing = map.get(key) || { manufacturer_name: key, rows: [], subtotal_quantity: 0, subtotal_amount: 0 };
      existing.rows.push(r);
      existing.subtotal_quantity += Number(r.total_quantity || 0);
      existing.subtotal_amount += Number(r.total_amount || 0);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => String(a.manufacturer_name).localeCompare(String(b.manufacturer_name)));
  }, [summaryRows]);

  // メーカーの選択肢
  const manufacturerOptions = useMemo(() => {
    const set = new Set<string>();
    (summaryRows || []).forEach((r: any) => set.add(r.manufacturer_name || '不明メーカー'));
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [summaryRows]);

  // メーカー絞り込みを適用した行
  const filteredSummaryRows = useMemo(() => {
    if (!selectedManufacturers || selectedManufacturers.length === 0) return summaryRows;
    const set = new Set(selectedManufacturers);
    return (summaryRows || []).filter((r: any) => set.has(r.manufacturer_name || '不明メーカー'));
  }, [summaryRows, selectedManufacturers]);

  // メーカー絞り込みを適用したグループ
  const manufacturerGroupsFiltered = useMemo(() => {
    if (!selectedManufacturers || selectedManufacturers.length === 0) return manufacturerGroups;
    const set = new Set(selectedManufacturers);
    return (manufacturerGroups || []).filter((g: any) => set.has(g.manufacturer_name || '不明メーカー'));
  }, [manufacturerGroups, selectedManufacturers]);

  const handleCsvExport = useCallback(() => {
    if (!summaryRows || summaryRows.length === 0 || !summaryDateList || summaryDateList.length === 0) return;
    const csvRows: string[] = [];

    // ヘッダー行：商品ID、商品名、各日付、合計本数、総金額（オプション）
    const dateHeaders = summaryDateList.map(d => `${new Date(d).getMonth() + 1}/${new Date(d).getDate()}`);
    const baseHeader = ['商品ID', '商品名', ...dateHeaders, '合計本数'];
    const header = showTotalAmount ? [...baseHeader, '総金額'] : baseHeader;
    csvRows.push(header.join(','));

    if (groupByManufacturer) {
      // メーカー別で出力（絞り込み反映）
      manufacturerGroupsFiltered.forEach((g) => {
        // メーカー見出し行
        csvRows.push([`"${g.manufacturer_name || ''}"`, ...Array(header.length - 1).fill('')].join(','));
        // 明細
        g.rows.forEach((r: any) => {
          const dailyValues = summaryDateList.map(date => r.daily_quantities?.[date] || 0);
          const row = [
            r.product_id,
            `"${r.product_name}"`,
            ...dailyValues,
            r.total_quantity
          ];
          if (showTotalAmount) {
            row.push(r.total_amount);
          }
          csvRows.push(row.join(','));
        });
        // 小計行
        const dayTotals = summaryDateList.map(date => 
          g.rows.reduce((sum: number, r: any) => sum + (r.daily_quantities?.[date] || 0), 0)
        );
        const subtotalRow = ['小計', '', ...dayTotals, g.subtotal_quantity];
        if (showTotalAmount) {
          subtotalRow.push(g.subtotal_amount.toString());
        }
        csvRows.push(subtotalRow.join(','));
        // 区切り
        csvRows.push('');
      });
      // 全体合計行
      const grandDayTotals = summaryDateList.map(date => 
        manufacturerGroupsFiltered.reduce((sum, g) => 
          sum + g.rows.reduce((s: number, r: any) => s + (r.daily_quantities?.[date] || 0), 0), 0
        )
      );
      const grandTotalQuantity = manufacturerGroupsFiltered.reduce((sum, g) => sum + g.subtotal_quantity, 0);
      const grandTotalAmount = manufacturerGroupsFiltered.reduce((sum, g) => sum + g.subtotal_amount, 0);
      const grandTotalRow = ['合計', '', ...grandDayTotals, grandTotalQuantity];
      if (showTotalAmount) {
        grandTotalRow.push(grandTotalAmount.toString());
      }
      csvRows.push(grandTotalRow.join(','));
    } else {
      // 商品別で出力（絞り込み反映）
      filteredSummaryRows.forEach((r) => {
        const dailyValues = summaryDateList.map(date => r.daily_quantities?.[date] || 0);
        const row = [
          r.product_id,
          `"${r.product_name}"`,
          ...dailyValues,
          r.total_quantity
        ];
        if (showTotalAmount) {
          row.push(r.total_amount.toString());
        }
        csvRows.push(row.join(','));
      });
      // 合計行
      const dayTotals = summaryDateList.map(date => 
        filteredSummaryRows.reduce((sum, row) => sum + (row.daily_quantities?.[date] || 0), 0)
      );
      const grandTotalQuantity = filteredSummaryRows.reduce((sum, row) => sum + row.total_quantity, 0);
      const grandTotalAmount = filteredSummaryRows.reduce((sum, row) => sum + row.total_amount, 0);
      const grandTotalRow = ['合計', '', ...dayTotals, grandTotalQuantity];
      if (showTotalAmount) {
        grandTotalRow.push(grandTotalAmount.toString());
      }
      csvRows.push(grandTotalRow.join(','));
    }
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `商品合計表_${startDate}_${days}日間.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [summaryRows, summaryDateList, startDate, days, groupByManufacturer, manufacturerGroupsFiltered, showTotalAmount, filteredSummaryRows]);

  const handleProductSummaryPdfExport = useCallback(async () => {
    if (!summaryRows || summaryRows.length === 0) return;
    try {
      const exportToPdf = await lazyExportToPdf();
      await exportToPdf('product-summary-content', {
        filename: `商品合計表_${startDate}_${days}日間.pdf`,
        title: `商品合計表 (${startDate} - ${days}日間)`,
        orientation: 'landscape'
      });
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDF出力に失敗しました');
    }
  }, [summaryRows, startDate, days]);

  return (
    <Box>
      {/* 期間・コース選択 */}
      <Card sx={{ mb: 3 }} className="print-header-hide">
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                label="開始日"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="日数"
                type="number"
                value={days}
                onChange={(e) => handleDaysChange(parseInt(e.target.value) || 1)}
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
                  onChange={(e) => handleCourseChange(e.target.value)}
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
                    setSelectedManufacturers(Array.isArray(value) ? value : []);
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
                <Button variant="outlined" onClick={handleToday} size="small">今日</Button>
                <Button variant="outlined" onClick={handleWeek} size="small">1週間</Button>
                <Button variant="text" onClick={() => setSelectedManufacturers([])} size="small">絞り込みクリア</Button>
              </Box>
            </Grid>
          </Grid>

          {/* 出力ボタン */}
          <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
            <Button
              variant="contained"
              onClick={fetchSummaryData}
              disabled={loading || !startDate || days <= 0}
              startIcon={loading ? <CircularProgress size={20} /> : undefined}
            >
              {loading ? '集計中...' : '集計'}
            </Button>
            <FormControlLabel
              control={<Checkbox checked={autoFetch} onChange={(e) => setAutoFetch(e.target.checked)} size="small" />}
              label="自動集計"
              sx={{ ml: 1 }}
            />
            {/* メーカー別グループ化トグル */}
            <FormControlLabel
              control={<Checkbox checked={groupByManufacturer} onChange={(e) => { setGroupByManufacturer(e.target.checked); localStorage.setItem('productSummaryTab_groupByManufacturer', JSON.stringify(e.target.checked)); }} size="small" />}
              label="メーカー別でグループ化"
              sx={{ ml: 1 }}
            />
            {/* 総金額表示トグル */}
            <FormControlLabel
              control={<Checkbox checked={showTotalAmount} onChange={(e) => { setShowTotalAmount(e.target.checked); localStorage.setItem('productSummaryTab_showTotalAmount', JSON.stringify(e.target.checked)); }} size="small" />}
              label="総金額を表示"
              sx={{ ml: 1 }}
            />
            <Button variant="outlined" startIcon={<Print />} disabled={!summaryRows || summaryRows.length === 0} onClick={() => window.print()}>
              印刷
            </Button>
            <Button variant="outlined" startIcon={<GetApp />} disabled={!summaryRows || summaryRows.length === 0} onClick={handleCsvExport}>
              CSV出力
            </Button>
            <Button variant="outlined" startIcon={<PictureAsPdf />} disabled={!summaryRows || summaryRows.length === 0} onClick={handleProductSummaryPdfExport}>
              PDF出力
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ローディング・エラー */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* 集計結果表示 */}
      {!loading && !error && summaryRows && summaryRows.length > 0 ? (
        <div id="product-summary-content">
          <Typography variant="h6" sx={{ mb: 2 }} className="no-print">
            集計期間: {startDate} ～ {calculateEndDate(startDate, days)} ({days}日間)
          </Typography>
          {(() => {
            // 日付リストを7日ごとに分割
            const dateChunks: string[][] = [];
            for (let i = 0; i < summaryDateList.length; i += 7) {
              dateChunks.push(summaryDateList.slice(i, i + 7));
            }

            return dateChunks.map((dateChunk, chunkIndex) => {
              const chunkStartDate = dateChunk[0];
              const chunkEndDate = dateChunk[dateChunk.length - 1];
              const chunkDays = dateChunk.length;

              return (
                <Box
                  key={chunkIndex}
                  sx={{
                    mb: 3,
                    '@media print': {
                      pageBreakBefore: chunkIndex > 0 ? 'always' : 'auto',
                      pageBreakInside: 'avoid',
                      mb: 2,
                    }
                  }}
                  className="print-page-chunk"
                >
                  <Typography variant="h6" sx={{ mb: 2, '@media print': { fontSize: '14px', mb: 1 } }}>
                    集計期間: {chunkStartDate} ～ {chunkEndDate} ({chunkDays}日間)
                    {dateChunks.length > 1 && ` (${chunkIndex + 1}/${dateChunks.length})`}
                  </Typography>
                  <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 3 }}>商品ID</TableCell>
                          <TableCell sx={{ position: 'sticky', left: 60, backgroundColor: 'white', zIndex: 3 }}>商品名</TableCell>
                          {dateChunk.map((date) => (
                            <TableCell key={date} align="right" sx={{ minWidth: 60 }}>
                              {new Date(date).getDate()}日
                            </TableCell>
                          ))}
                          <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>合計本数</TableCell>
                          {showTotalAmount && <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: '#f5f5f5' }}>総金額</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                {groupByManufacturer ? (
                  <>
                    {manufacturerGroupsFiltered.map((g) => (
                      <React.Fragment key={g.manufacturer_name}>
                        <TableRow>
                          <TableCell colSpan={2 + dateChunk.length + (showTotalAmount ? 2 : 1)} sx={{ backgroundColor: '#f5f5f5', fontWeight: 600 }}>
                            メーカー：{g.manufacturer_name || '-'}
                          </TableCell>
                        </TableRow>
                        {g.rows.map((row: any) => (
                          <TableRow key={row.product_id}>
                            <TableCell sx={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 2 }}>{row.product_id}</TableCell>
                            <TableCell sx={{ position: 'sticky', left: 60, backgroundColor: 'white', zIndex: 2 }}>{row.product_name}</TableCell>
                            {dateChunk.map((date) => (
                              <TableCell key={date} align="right">
                                {row.daily_quantities?.[date] || 0}
                              </TableCell>
                            ))}
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{row.total_quantity}</TableCell>
                            {showTotalAmount && <TableCell align="right" sx={{ fontWeight: 600 }}>{row.total_amount}</TableCell>}
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={2} align="right" sx={{ fontWeight: 600 }}>小計</TableCell>
                          {dateChunk.map((date) => {
                            const dayTotal = g.rows.reduce((sum: number, r: any) => sum + (r.daily_quantities?.[date] || 0), 0);
                            return (
                              <TableCell key={date} align="right" sx={{ fontWeight: 600 }}>{dayTotal}</TableCell>
                            );
                          })}
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{g.subtotal_quantity}</TableCell>
                          {showTotalAmount && <TableCell align="right" sx={{ fontWeight: 600 }}>{g.subtotal_amount}</TableCell>}
                        </TableRow>
                      </React.Fragment>
                    ))}
                    {/* 全体の合計行 */}
                    {(() => {
                      const grandTotalQuantity = manufacturerGroupsFiltered.reduce((sum, g) => sum + g.subtotal_quantity, 0);
                      const grandTotalAmount = manufacturerGroupsFiltered.reduce((sum, g) => sum + g.subtotal_amount, 0);
                      const dayTotals = dateChunk.map(date => 
                        manufacturerGroupsFiltered.reduce((sum, g) => 
                          sum + g.rows.reduce((s: number, r: any) => s + (r.daily_quantities?.[date] || 0), 0), 0
                        )
                      );
                      return (
                        <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 700 }}>
                          <TableCell colSpan={2} align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>合計</TableCell>
                          {dayTotals.map((total, idx) => (
                            <TableCell key={dateChunk[idx]} align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>{total}</TableCell>
                          ))}
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>{grandTotalQuantity}</TableCell>
                          {showTotalAmount && <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>{grandTotalAmount}</TableCell>}
                        </TableRow>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {filteredSummaryRows.map((row) => (
                      <TableRow key={row.product_id}>
                        <TableCell sx={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 2 }}>{row.product_id}</TableCell>
                        <TableCell sx={{ position: 'sticky', left: 60, backgroundColor: 'white', zIndex: 2 }}>{row.product_name}</TableCell>
                        {dateChunk.map((date) => (
                          <TableCell key={date} align="right">
                            {row.daily_quantities?.[date] || 0}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{row.total_quantity}</TableCell>
                        {showTotalAmount && <TableCell align="right" sx={{ fontWeight: 600 }}>{row.total_amount}</TableCell>}
                      </TableRow>
                    ))}
                    {/* 合計行 */}
                    {(() => {
                      const dayTotals = dateChunk.map(date => 
                        filteredSummaryRows.reduce((sum, row) => sum + (row.daily_quantities?.[date] || 0), 0)
                      );
                      const grandTotalQuantity = filteredSummaryRows.reduce((sum, row) => sum + row.total_quantity, 0);
                      const grandTotalAmount = filteredSummaryRows.reduce((sum, row) => sum + row.total_amount, 0);
                      return (
                        <TableRow sx={{ backgroundColor: '#e3f2fd', fontWeight: 700 }}>
                          <TableCell colSpan={2} align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>合計</TableCell>
                          {dayTotals.map((total, idx) => (
                            <TableCell key={dateChunk[idx]} align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>{total}</TableCell>
                          ))}
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>{grandTotalQuantity}</TableCell>
                          {showTotalAmount && <TableCell align="right" sx={{ fontWeight: 700, fontSize: '1rem' }}>{grandTotalAmount}</TableCell>}
                        </TableRow>
                      );
                    })()}
                  </>
                )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              );
            });
          })()}
        </div>
      ) : (
        !loading && !error && (
          <Paper sx={{ p: 4, textAlign: 'center', mt: 2 }}>
            <Typography variant="h6" color="text.secondary">データがありません。期間とコースを指定して「集計」を押してください。</Typography>
          </Paper>
        )
      )}
    </Box>
  );
};

// メインコンポーネント
const DeliveryList: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      {/* ヘッダー部分 */}
      <Box sx={{ mb: 3 }} className="print-header-hide">
        <Typography variant="h4" component="h1" gutterBottom>
          各種帳票出力
        </Typography>
        <Typography variant="body1" color="textSecondary">
          配達リストや商品合計表などの各種帳票を出力できます
        </Typography>
      </Box>

      {/* タブ */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }} className="print-header-hide">
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="期間別配達リスト" />
          <Tab label="商品合計表" />
        </Tabs>
      </Box>

      {/* タブコンテンツ */}
      {tabValue === 0 && <PeriodDeliveryListTab />}
      {tabValue === 1 && <ProductSummaryTab />}
    </Box>
  );
};

export default DeliveryList;