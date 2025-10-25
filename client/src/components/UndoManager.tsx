import React, { useState, useCallback } from 'react';
import { Box, Button, Chip, Alert } from '@mui/material';
import { Undo as UndoIcon } from '@mui/icons-material';
import { UndoAction } from '../types/customerDetail';

interface UndoManagerProps {
  undoActions: UndoAction[];
  onUndo: (action: UndoAction) => Promise<void>;
  onClearUndo: () => void;
}

const UndoManager: React.FC<UndoManagerProps> = ({
  undoActions,
  onUndo,
  onClearUndo
}) => {
  const [undoing, setUndoing] = useState<boolean>(false);

  const handleUndo = useCallback(async (action: UndoAction) => {
    try {
      setUndoing(true);
      await onUndo(action);
    } catch (error) {
      console.error('Undo操作エラー:', error);
    } finally {
      setUndoing(false);
    }
  }, [onUndo]);

  if (undoActions.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="info" sx={{ mb: 1 }}>
        最近の変更:
      </Alert>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {undoActions.map((action, index) => (
          <Chip
            key={index}
            label={action.description}
            icon={<UndoIcon />}
            onClick={() => handleUndo(action)}
            disabled={undoing}
            color="primary"
            variant="outlined"
            sx={{ cursor: 'pointer' }}
          />
        ))}
        <Button
          size="small"
          onClick={onClearUndo}
          disabled={undoing}
          sx={{ ml: 1 }}
        >
          履歴をクリア
        </Button>
      </Box>
    </Box>
  );
};

export default UndoManager;
