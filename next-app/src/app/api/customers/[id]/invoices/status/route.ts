import { internalError, badRequest } from "@/lib/api/responses";
import { parseCustomerId, parseYearMonth } from "@/lib/validators/common";
import { withServiceSupabase } from "@/lib/supabaseServer";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url);
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");

  if (!yearRaw || !monthRaw) {
    return badRequest("year と month は必須です");
  }

  let customerId: number;
  try {
    customerId = parseCustomerId(params.id);
  } catch {
    return badRequest("顧客IDが不正です");
  }

  let targetYear: number;
  let targetMonth: number;
  try {
    ({ year: targetYear, month: targetMonth } = parseYearMonth(yearRaw, monthRaw));
  } catch {
    return badRequest("年月が不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data, error } = await client
      .from("ar_invoices")
      .select("status, confirmed_at, rounding_enabled, amount")
      .eq("customer_id", customerId)
      .eq("year", targetYear)
      .eq("month", targetMonth)
      .maybeSingle();

    if (error) {
      return internalError("請求状況の取得に失敗しました", error.message);
    }

    if (!data) {
      return Response.json({ status: "not_found" });
    }

    return Response.json(data);
  });
}

