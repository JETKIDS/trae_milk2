import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parseCourseId, parseYearMonth } from "@/lib/validators/common";
import { generateMonthlyCalendar } from "@/lib/calendar/generateMonthlyCalendar";

export async function GET(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const methodParam = searchParams.get("method") ?? "collection";

  if (!yearParam || !monthParam) {
    return badRequest("year と month は必須です");
  }

  let courseId: number;
  let targetYear: number;
  let targetMonth: number;
  const method = methodParam === "debit" ? "debit" : "collection";

  try {
    courseId = parseCourseId(params.courseId);
    ({ year: targetYear, month: targetMonth } = parseYearMonth(yearParam, monthParam));
  } catch {
    return badRequest("入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    // コース内の顧客を取得（集金方法でフィルタ）
    const { data: customers, error: customersError } = await client
      .from("customers")
      .select(
        `
        id,
        custom_id,
        customer_name,
        customer_settings:customer_settings (
          billing_method,
          rounding_enabled
        )
      `,
      )
      .eq("course_id", courseId)
      .order("delivery_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });

    if (customersError) {
      return internalError("顧客一覧の取得に失敗しました", customersError.message);
    }

    // 請求設定でフィルタリング（billing_method が null の場合は 'collection' とみなす）
    const filteredCustomers = (customers ?? []).filter((c) => {
      const billingMethod = (c.customer_settings as { billing_method: string | null } | null)?.billing_method;
      return (billingMethod ?? "collection") === method;
    });

    const items = [];

    for (const customer of filteredCustomers) {
      const customerId = customer.id as number;
      const settings = customer.customer_settings as { rounding_enabled: boolean | null } | null;
      const roundingEnabled = settings?.rounding_enabled !== false;

      // 請求データを取得
      const { data: invoice, error: invoiceError } = await client
        .from("ar_invoices")
        .select("amount, status")
        .eq("customer_id", customerId)
        .eq("year", targetYear)
        .eq("month", targetMonth)
        .maybeSingle();

      if (invoiceError) {
        return internalError("請求データの取得に失敗しました", invoiceError.message);
      }

      let amount: number;
      let confirmed = false;

      if (invoice && typeof invoice.amount === "number") {
        amount = invoice.amount;
        confirmed = invoice.status === "confirmed";
      } else {
        // 請求データがない場合はカレンダーから計算
        const { data: patterns, error: patternError } = await client
          .from("delivery_patterns")
          .select(
            `
            product_id,
            delivery_days,
            daily_quantities,
            quantity,
            unit_price,
            start_date,
            end_date,
            products:products (
              product_name,
              unit
            )
          `,
          )
          .eq("customer_id", customerId)
          .eq("is_active", true);

        if (patternError) {
          return internalError("配達パターンの取得に失敗しました", patternError.message);
        }

        const monthStart = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
        const monthEnd = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${new Date(
          targetYear,
          targetMonth,
          0,
        )
          .getDate()
          .toString()
          .padStart(2, "0")}`;

        const { data: tempChanges, error: tempError } = await client
          .from("temporary_changes")
          .select(
            `
            change_date,
            change_type,
            product_id,
            quantity,
            unit_price,
            created_at,
            products:products (
              product_name,
              unit_price,
              unit
            )
          `,
          )
          .eq("customer_id", customerId)
          .gte("change_date", monthStart)
          .lte("change_date", monthEnd);

        if (tempError) {
          return internalError("臨時変更の取得に失敗しました", tempError.message);
        }

        const calendar = generateMonthlyCalendar(
          targetYear,
          targetMonth,
          (patterns ?? []) as unknown[],
          (tempChanges ?? []) as unknown[],
        );

        const totalRaw = calendar.reduce(
          (sum, day) => sum + day.products.reduce((s, p) => s + (p.amount || 0), 0),
          0,
        );

        amount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
      }

      items.push({
        customer_id: customerId,
        amount,
        confirmed,
        rounding_enabled: roundingEnabled ? 1 : 0,
      });
    }

    return Response.json({
      year: targetYear,
      month: targetMonth,
      method,
      items,
    });
  });
}
