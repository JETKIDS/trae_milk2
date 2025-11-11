import { withServiceSupabase } from "@/lib/supabaseServer";

export const updateCustomerLedger = async (customerId: number, year: number, month: number) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_update_customer_ledger", {
        target_customer_id: customerId,
        target_year: year,
        target_month: month,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_update_customer_ledger failed: ${error.message}`);
    }

    return data;
  });

export const confirmInvoice = async (customerId: number, year: number, month: number, roundingEnabled?: boolean) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_confirm_invoice", {
        target_customer_id: customerId,
        target_year: year,
        target_month: month,
        target_rounding_enabled: roundingEnabled ?? true,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_confirm_invoice failed: ${error.message}`);
    }

    return data;
  });

export const unconfirmInvoice = async (customerId: number, year: number, month: number) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_unconfirm_invoice", {
        target_customer_id: customerId,
        target_year: year,
        target_month: month,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_unconfirm_invoice failed: ${error.message}`);
    }

    return data;
  });

export const pushUndo = async (
  customerId: number,
  actionType: string,
  payload: Record<string, unknown>,
  metadata?: Record<string, unknown> | null,
) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_push_undo", {
        target_customer_id: customerId,
        target_action_type: actionType,
        target_payload: payload,
        target_metadata: metadata ?? null,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_push_undo failed: ${error.message}`);
    }

    return data;
  });

export const popUndo = async (customerId: number) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_pop_undo", {
        target_customer_id: customerId,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_pop_undo failed: ${error.message}`);
    }

    return data;
  });

export const pushMasterUndo = async (
  entityType: string,
  entityId: number | null,
  actionType: string,
  payload: Record<string, unknown>,
  metadata?: Record<string, unknown> | null,
) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_push_master_undo", {
        target_entity_type: entityType,
        target_entity_id: entityId,
        target_action_type: actionType,
        target_payload: payload,
        target_metadata: metadata ?? null,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_push_master_undo failed: ${error.message}`);
    }

    return data;
  });

export const popMasterUndo = async (entityType: string, entityId?: number | null) =>
  withServiceSupabase(async (client) => {
    const { data, error } = await client
      .rpc("rpc_pop_master_undo", {
        target_entity_type: entityType,
        target_entity_id: entityId ?? null,
      })
      .maybeSingle();

    if (error) {
      throw new Error(`rpc_pop_master_undo failed: ${error.message}`);
    }

    return data;
  });

