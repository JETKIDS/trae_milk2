import { ZodError } from "zod";
import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { z } from "zod";
import { updateCustomerLedger } from "@/lib/supabaseRpc";

const batchPaymentSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  method: z.enum(["collection", "debit"]).default("collection"),
  entries: z.array(
    z.object({
      customer_id: z.number().int().positive(),
      amount: z.number().int().positive(),
      note: z.string().nullable().optional(),
    }),
  ).min(1),
});

export async function POST(request: Request) {
  let payload;
  try {
    const raw = await request.json();
    payload = batchPaymentSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("入力値が不正です");
    }
    return internalError("リクエストデータの解析中にエラーが発生しました");
  }

  const { year, month, method, entries } = payload;

  return withServiceSupabase(async (client) => {
    // 前月の請求が確定済みか確認
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;

    const customerIds = entries.map((e) => e.customer_id);
    const { data: confirmedInvoices, error: confirmedError } = await client
      .from("ar_invoices")
      .select("customer_id")
      .in("customer_id", customerIds)
      .eq("year", prevYear)
      .eq("month", prevMonth)
      .eq("status", "confirmed");

    if (confirmedError) {
      return internalError("請求データの確認に失敗しました", confirmedError.message);
    }

    const confirmedSet = new Set((confirmedInvoices ?? []).map((row) => row.customer_id as number));

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // トランザクション的に処理（Supabase は自動的にトランザクションを管理）
    for (const entry of entries) {
      if (!confirmedSet.has(entry.customer_id)) {
        failed += 1;
        errors.push(`顧客ID ${entry.customer_id}: 前月の請求が確定されていません`);
        continue;
      }

      try {
        const { error: insertError } = await client.from("ar_payments").insert({
          customer_id: entry.customer_id,
          year,
          month,
          amount: entry.amount,
          method,
          note: entry.note ?? null,
        });

        if (insertError) {
          failed += 1;
          errors.push(`顧客ID ${entry.customer_id}: ${insertError.message}`);
          continue;
        }

        // 台帳を更新
        await updateCustomerLedger(entry.customer_id, year, month);

        success += 1;
      } catch (error) {
        failed += 1;
        errors.push(`顧客ID ${entry.customer_id}: ${error instanceof Error ? error.message : "不明なエラー"}`);
      }
    }

    return Response.json({
      year,
      month,
      method,
      success,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  });
}
