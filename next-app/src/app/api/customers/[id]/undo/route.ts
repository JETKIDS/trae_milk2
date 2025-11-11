import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { parseCustomerId } from "@/lib/validators/common";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { popUndo, updateCustomerLedger } from "@/lib/supabaseRpc";
import { parseYearMonthFromDate } from "@/lib/dates";
import { UndoEntry } from "@/lib/undo/types";

const handleTemporaryChangeUndo = async (client: SupabaseClient, entry: UndoEntry) => {
  const operation = entry?.payload?.operation;
  const change = entry?.payload?.change;
  const before = entry?.payload?.before;

  if (operation === "create" && change && change.id) {
    const { error } = await client.from("temporary_changes").delete().eq("id", change.id);
    if (error) throw new Error(error.message);

    const { year, month } = parseYearMonthFromDate(change.change_date);
    await updateCustomerLedger(entry.customer_id, year, month);
    return { message: "臨時変更の登録を取り消しました" };
  }

  if (operation === "update" && before && before.id) {
    const { error } = await client
      .from("temporary_changes")
      .update({
        change_date: before.change_date,
        change_type: before.change_type,
        product_id: before.product_id,
        quantity: before.quantity,
        unit_price: before.unit_price,
        reason: before.reason,
      })
      .eq("id", before.id);

    if (error) throw new Error(error.message);

    const { year, month } = parseYearMonthFromDate(before.change_date);
    await updateCustomerLedger(entry.customer_id, year, month);
    return { message: "臨時変更の更新を取り消しました" };
  }

  if (operation === "delete" && before) {
    const { error } = await client.from("temporary_changes").insert({
      customer_id: before.customer_id,
      change_date: before.change_date,
      change_type: before.change_type,
      product_id: before.product_id,
      quantity: before.quantity,
      unit_price: before.unit_price,
      reason: before.reason,
      created_at: before.created_at,
      updated_at: before.updated_at,
    });

    if (error) throw new Error(error.message);

    const { year, month } = parseYearMonthFromDate(before.change_date);
    await updateCustomerLedger(entry.customer_id, year, month);
    return { message: "臨時変更の削除を取り消しました" };
  }

  throw new Error("サポートされていない臨時変更の Undo ペイロードです");
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let customerId: number;
  try {
    customerId = parseCustomerId(params.id);
  } catch {
    return badRequest("顧客IDが不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const entry = await popUndo(customerId);
      if (!entry) {
        return badRequest("Undo 可能な操作がありません");
      }

      if (entry.action_type === "temporary_change") {
        const result = await handleTemporaryChangeUndo(client, entry);
        return Response.json({ undo: entry, result });
      }

      return badRequest("未対応の Undo 操作です");
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("Undo の実行に失敗しました", message);
    }
  });
}

