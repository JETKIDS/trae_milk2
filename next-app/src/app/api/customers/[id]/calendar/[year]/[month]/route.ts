import moment from "moment";
import { badRequest, internalError } from "@/lib/api/responses";
import { parseCustomerId, parseYearMonth } from "@/lib/validators/common";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { generateMonthlyCalendar } from "@/lib/calendar/generateMonthlyCalendar";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; year: string; month: string } },
) {
  let customerId: number;
  try {
    customerId = parseCustomerId(params.id);
  } catch {
    return badRequest("顧客IDが不正です");
  }

  let year: number;
  let month: number;
  try {
    ({ year, month } = parseYearMonth(params.year, params.month));
  } catch {
    return badRequest("年月が不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data: customer, error: customerError } = await client
      .from("customers")
      .select(
        `
          *,
          delivery_courses:delivery_courses ( course_name ),
          delivery_staff:delivery_staff ( staff_name )
        `,
      )
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) {
      return internalError("顧客情報の取得に失敗しました", customerError.message);
    }

    if (!customer) {
      return badRequest("顧客が見つかりません");
    }

    const { data: patterns, error: patternError } = await client
      .from("delivery_patterns")
      .select(
        `
          product_id,
          delivery_days,
          daily_quantities,
          unit_price,
          start_date,
          end_date,
          quantity,
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

    const startOfMonth = moment(`${year}-${String(month).padStart(2, "0")}-01`).startOf("month").format("YYYY-MM-DD");
    const endOfMonth = moment(startOfMonth).endOf("month").format("YYYY-MM-DD");

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
      .gte("change_date", startOfMonth)
      .lte("change_date", endOfMonth);

    if (tempError) {
      return internalError("臨時変更の取得に失敗しました", tempError.message);
    }

    const patternRows = (patterns ?? []).map((pattern) => ({
      product_id: pattern.product_id,
      product_name: pattern.products?.product_name ?? "",
      unit: pattern.products?.unit ?? null,
      unit_price: pattern.unit_price,
      delivery_days: pattern.delivery_days,
      daily_quantities: pattern.daily_quantities,
      start_date: pattern.start_date,
      end_date: pattern.end_date,
      quantity: pattern.quantity,
    }));

    const temporaryChangeRows = (tempChanges ?? []).map((change) => ({
      change_date: change.change_date,
      change_type: change.change_type,
      product_id: change.product_id,
      product_name: change.products?.product_name ?? "",
      quantity: change.quantity,
      unit_price: change.unit_price,
      product_unit_price: change.products?.unit_price ?? null,
      unit: change.products?.unit ?? null,
      created_at: change.created_at,
    }));

    const calendar = generateMonthlyCalendar(year, month, patternRows, temporaryChangeRows);

    return Response.json({
      customer,
      calendar,
      temporaryChanges: temporaryChangeRows,
    });
  });
}

