import React from 'react';
import moment from 'moment';
import DeliveryPatternManager from '../../components/DeliveryPatternManager';
import TemporaryChangeManager from '../../components/TemporaryChangeManager';
import { DeliveryPattern, TemporaryChange } from '../../types/customerDetail';

interface CustomerDetailPanelProps {
  customerId: number;
  currentDate: moment.Moment;
  patterns: DeliveryPattern[];
  temporaryChanges: TemporaryChange[];
  dpManagerRef: React.MutableRefObject<any> | null;
  tempChangeManagerRef: React.MutableRefObject<any> | null;
  onPatternsChange: () => Promise<void> | void;
  onTemporaryChangesUpdate: () => Promise<void> | void;
  onRecordUndo: (action: { description: string; revert: () => Promise<void> } | { description: string; revert: () => Promise<void> }[]) => void;
  readOnly: boolean;
}

// 配達パターンと臨時変更の管理ブロックをまとめた詳細パネル
const CustomerDetailPanel: React.FC<CustomerDetailPanelProps> = ({
  customerId,
  currentDate,
  patterns,
  temporaryChanges,
  dpManagerRef,
  tempChangeManagerRef,
  onPatternsChange,
  onTemporaryChangesUpdate,
  onRecordUndo,
  readOnly,
}) => {
  // 当月に期間が重なるパターンのみを表示対象とする
  const monthStart = currentDate.clone().startOf('month');
  const monthEnd = currentDate.clone().endOf('month');
  const visiblePatterns = patterns.filter(p =>
    moment(p.start_date).isSameOrBefore(monthEnd, 'day') &&
    (!p.end_date || moment(p.end_date).isSameOrAfter(monthStart, 'day'))
  );

  // Managerに渡す前に型・データを正規化
  const toNumArray = (days: number[] | string): number[] => {
    if (Array.isArray(days)) return days;
    try {
      const parsed = JSON.parse(days as unknown as string);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const toDQObject = (
    dq: { [dayOfWeek: number]: number } | string | null | undefined
  ): { [dayOfWeek: number]: number } | undefined => {
    if (!dq) return undefined;
    if (typeof dq === 'string') {
      try {
        const parsed = JSON.parse(dq);
        return parsed && typeof parsed === 'object' ? (parsed as { [dayOfWeek: number]: number }) : undefined;
      } catch {
        return undefined;
      }
    }
    return dq as { [dayOfWeek: number]: number };
  };

  const visiblePatternsForManager = visiblePatterns.map(p => ({
    ...p,
    delivery_days: toNumArray(p.delivery_days),
    daily_quantities: toDQObject(p.daily_quantities),
  }));

  return (
    <>
      <DeliveryPatternManager
        ref={dpManagerRef as any}
        customerId={customerId}
        patterns={visiblePatternsForManager as any}
        onPatternsChange={onPatternsChange}
        onTemporaryChangesUpdate={onTemporaryChangesUpdate}
        onRecordUndo={onRecordUndo}
        readOnly={readOnly}
      />

      <TemporaryChangeManager
        ref={tempChangeManagerRef as any}
        customerId={customerId}
        changes={temporaryChanges}
        onChangesUpdate={onTemporaryChangesUpdate}
        readOnly={readOnly}
      />
    </>
  );
};

export default CustomerDetailPanel;