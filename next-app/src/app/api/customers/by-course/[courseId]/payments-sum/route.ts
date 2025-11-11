import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parseCourseId, parseYearMonth } from "@/lib/validators/common";

export async function GET(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  if (!yearParam || !monthParam) {
    return badRequest("year と month は必須です");
  }

  let courseId: number;
  let targetYear: number;
  let targetMonth: number;

  try {
    courseId = parseCourseId(params.courseId);
    ({ year: targetYear, month: targetMonth } = parseYearMonth(yearParam, monthParam));
  } catch {
    return badRequest("入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    // コース内の顧客を取得
    const { data: customers, error: customersError } = await client
      .from("customers")
      .select("id")
      .eq("course_id", courseId)
      .order("delivery_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (customersError) {
      return internalError("顧客一覧の取得に失敗しました", customersError.message);
    }

    const customerIds = (customers ?? []).map((c) => c.id as number);

    if (customerIds.length === 0) {
      return Response.json({
        year: targetYear,
        month: targetMonth,
        items: [],
      });
    }

    // 各顧客の入金合計を取得
    const { data: payments, error: paymentsError } = await client
      .from("ar_payments")
      .select("customer_id, amount")
      .in("customer_id", customerIds)
      .eq("year", targetYear)
      .eq("month", targetMonth);

    if (paymentsError) {
      return internalError("入金データの取得に失敗しました", paymentsError.message);
    }

    // 顧客ごとの入金合計を計算
    const customerTotals = new Map<number, number>();

    for (const customerId of customerIds) {
      customerTotals.set(customerId, 0);
    }

    for (const payment of payments ?? []) {
      const customerId = payment.customer_id as number;
      const amount = Number(payment.amount) || 0;
      const current = customerTotals.get(customerId) ?? 0;
      customerTotals.set(customerId, current + amount);
    }

    const items = Array.from(customerTotals.entries()).map(([customer_id, total]) => ({
      customer_id,
      total,
    }));

    return Response.json({
      year: targetYear,
      month: targetMonth,
      items,
    });
  });
}
