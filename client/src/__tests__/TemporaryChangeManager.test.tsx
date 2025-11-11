import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TemporaryChangeManager from '../components/TemporaryChangeManager';

vi.mock('../services/temporaryChanges', () => ({
  deleteTemporaryChange: vi.fn(async () => Promise.resolve()),
  createTemporaryChange: vi.fn(async () => Promise.resolve(123)),
  updateTemporaryChange: vi.fn(async () => Promise.resolve()),
}));

// サーバー呼び出しのない部分だけをテストするため、products API は最低限のモック
  vi.mock('../utils/apiClient', () => ({
    get: vi.fn(async (url: string) => {
      if (url === '/api/products') {
        return { data: [{ id: 1, product_name: '牛乳', manufacturer_name: 'A社', unit: '本', unit_price: 120 }] };
      }
      return { data: [] };
    }),
  }));

describe('TemporaryChangeManager', () => {
  test('削除ボタンで deleteTemporaryChange が呼ばれ、更新コールバックが実行される', async () => {
    const onChangesUpdate = vi.fn();
    const changes = [
      {
        id: 101,
        customer_id: 1,
        change_date: '2025-07-02',
        change_type: 'skip',
        product_id: 1,
      },
    ];

    // confirm を常に true にする
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    render(
      <TemporaryChangeManager
        customerId={1}
        changes={changes as any}
        onChangesUpdate={onChangesUpdate}
        readOnly={false}
      />
    );

    // 削除アイコン（DeleteIcon）を探して、その親ボタンをクリック
    const deleteIcons = screen.getAllByTestId('DeleteIcon');
    expect(deleteIcons.length).toBeGreaterThan(0);
    const deleteButton = deleteIcons[0].closest('button')!;
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(onChangesUpdate).toHaveBeenCalled();
    });

    confirmSpy.mockRestore();
  });
});