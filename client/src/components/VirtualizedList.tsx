import React, { useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Box, Typography } from '@mui/material';

interface VirtualizedListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  onItemClick?: (item: T, index: number) => void;
}

function VirtualizedList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  emptyMessage = 'データがありません',
  onItemClick
}: VirtualizedListProps<T>) {
  const itemData = useMemo(() => ({
    items,
    renderItem,
    onItemClick
  }), [items, renderItem, onItemClick]);

  const Row = useCallback(({ index, style, data }: any) => {
    const { items, renderItem, onItemClick } = data;
    const item = items[index];

    return (
      <div
        style={{ ...style, cursor: onItemClick ? 'pointer' : 'default' }}
        onClick={() => onItemClick?.(item, index)}
      >
        {renderItem(item, index)}
      </div>
    );
  }, []);

  if (items.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary'
        }}
      >
        <Typography variant="body2">{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      itemData={itemData}
      width="100%"
    >
      {Row}
    </List>
  );
}

export default VirtualizedList;
