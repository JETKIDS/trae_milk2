import { ZodError } from "zod";
import { internalError, badRequest } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parseCustomerId, parseLimit } from "@/lib/validators/common";
import { parsePaymentRequest } from "@/lib/validators/payments";
import { updateCustomerLedger } from "@/lib/supabaseRpc";

type Params = { params: { id: string } };

export async function GET(request: Request, { params }: Params) {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit") ?? undefined;
  let customerId: number;
  let limit = 100;

  try {
    customerId = parseCustomerId(params.id);
    if (limitRaw !== undefined) {
      limit = parseLimit(limitRaw);
    }
  } catch {
    return badRequest("入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data, error } = await client
      .from("ar_payments")
      .select("*")
      .eq("customer_id", customerId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return internalError("入金履歴の取得に失敗しました", error.message);
    }

    return Response.json({ items: data ?? [] });
  });
}

export async function POST(request: Request, { params }: Params) {
  let customerId: number;
  try {
    customerId = parseCustomerId(params.id);
  } catch {
    return badRequest("顧客IDが不正です");
  }

  let payload;
  try {
    const raw = await request.json();
    payload = parsePaymentRequest(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("入力値が不正です");
    }
    return internalError("入金データの解析中にエラーが発生しました");
  }

  return withServiceSupabase(async (client) => {
    const { data, error } = await client
      .from("ar_payments")
      .insert({
        customer_id: customerId,
        year: payload.year,
        month: payload.month,
        amount: payload.amount,
        method: payload.method,
        note: payload.note ?? null,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      const isConstraintError = error.code === "23505" || error.code === "23514";
      if (isConstraintError) {
        return badRequest("入金データの登録に失敗しました。入力内容を確認してください。");
      }
      return internalError("入金登録に失敗しました", error.message);
    }

    if (!data) {
      return internalError("入金登録に失敗しました");
    }

    await updateCustomerLedger(customerId, payload.year, payload.month);

    return Response.json({ item: data }, { status: 201 });
  });
}

