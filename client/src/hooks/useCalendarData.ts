import { useState, useEffect, useCallback } from 'react';
import apiClient from '../utils/apiClient';
import moment from 'moment';
import { CalendarDay, TemporaryChange } from '../types/customerDetail';

interface UseCalendarDataReturn {
  calendar: CalendarDay[];
  temporaryChanges: TemporaryChange[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useCalendarData = (
  customerId: string | undefined,
  currentDate: moment.Moment
): UseCalendarDataReturn => {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [temporaryChanges, setTemporaryChanges] = useState<TemporaryChange[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendarData = useCallback(async () => {
    if (!customerId) {
      setError('顧客IDが指定されていません');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const y = currentDate.year();
      const m = currentDate.month() + 1;
      const res = await apiClient.get(`/api/customers/${customerId}/calendar/${y}/${m}`);
      const data = res.data || {};
      
      setCalendar(data.calendar || []);
      setTemporaryChanges(data.temporaryChanges || []);
    } catch (err: any) {
      console.error('カレンダー取得エラー', err);
      setError(err?.response?.data?.error || 'カレンダーデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [customerId, currentDate]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  return {
    calendar,
    temporaryChanges,
    loading,
    error,
    refetch: fetchCalendarData
  };
};
