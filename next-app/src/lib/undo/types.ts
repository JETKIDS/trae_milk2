export type UndoActionType = "temporary_change" | "payment" | "invoice_confirm";

export type UndoPayload = Record<string, unknown>;

export type UndoEntry = {
  id: number;
  customer_id: number;
  action_type: UndoActionType;
  payload: UndoPayload;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

