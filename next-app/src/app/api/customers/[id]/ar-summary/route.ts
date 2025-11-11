import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { parseCustomerId, parseYearMonth } from "@/lib/validators/common";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { generateMonthlyCalendar } from "@/lib/calendar/generateMonthlyCalendar";
import { getPrevYearMonth } from "@/lib/dates";

type PatternRow = {
  product_id: number;
  delivery_days: unknown;
  daily_quantities: unknown;
  quantity: number | null;
  unit_price: number;
  start_date: string | null;
  end_date: string | null;
  products: {
    product_name: string;
    unit: string | null;
  } | null;
};

type TemporaryChangeRow = {
  change_date: string;
  change_type: "skip" | "add" | "modify";
  product_id: number | null;
  quantity: number | null;
  unit_price: number | null;
  created_at: string | null;
  products: {
    product_name: string;
    unit_price: number | null;
    unit: string | null;
  } | null;
};

const sumPayments = async (client: SupabaseClient, customerId: number, year: number, month: number) => {
  const { data, error } = await client
    .from("ar_payments")
    .select("amount")
    .eq("customer_id", customerId)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).reduce((total, row) => total + (row.amount ?? 0), 0);
};

const calculateMonthlyTotal = (
  year: number,
  month: number,
  patterns: PatternRow[],
  temporaryChanges: TemporaryChangeRow[],
) => {
  const patternRows = patterns.map((pattern) => ({
    product_id: pattern.product_id,
    product_name: pattern.products?.product_name ?? "",
    unit: pattern.products?.unit ?? null,
    unit_price: Number(pattern.unit_price),
    delivery_days: pattern.delivery_days,
    daily_quantities: pattern.daily_quantities,
    start_date: pattern.start_date,
    end_date: pattern.end_date,
    quantity: pattern.quantity,
  }));

  const temporaryChangeRows = temporaryChanges.map((change) => ({
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
  return calendar.reduce(
    (total, day) => total + day.products.reduce((subtotal, product) => subtotal + product.amount, 0),
    0,
  );
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  if (!yearParam || !monthParam) {
    return badRequest("year と month は必須です");
  }

  let customerId: number;
  let targetYear: number;
  let targetMonth: number;

  try {
    customerId = parseCustomerId(params.id);
    ({ year: targetYear, month: targetMonth } = parseYearMonth(yearParam, monthParam));
  } catch {
    return badRequest("入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { year: prevYear, month: prevMonth } = getPrevYearMonth(targetYear, targetMonth);

      const { data: roundingRow, error: roundingError } = await client
        .from("customer_settings")
        .select("rounding_enabled")
        .eq("customer_id", customerId)
        .maybeSingle();

      if (roundingError) {
        return internalError("請求設定の取得に失敗しました", roundingError.message);
      }

      const roundingEnabled =
        roundingRow?.rounding_enabled === null || roundingRow?.rounding_enabled === undefined
          ? true
          : Boolean(roundingRow.rounding_enabled);

      const { data: invoiceRow, error: invoiceError } = await client
        .from("ar_invoices")
        .select("amount")
        .eq("customer_id", customerId)
        .eq("year", prevYear)
        .eq("month", prevMonth)
        .maybeSingle();

      if (invoiceError) {
        return internalError("請求データの取得に失敗しました", invoiceError.message);
      }

      let prevInvoiceAmount: number | null = invoiceRow?.amount ?? null;

      if (prevInvoiceAmount === null || Number.isNaN(prevInvoiceAmount)) {
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

        const monthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
        const monthEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${new Date(
          prevYear,
          prevMonth,
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

        const totalRaw = calculateMonthlyTotal(
          prevYear,
          prevMonth,
          (patterns ?? []) as PatternRow[],
          (tempChanges ?? []) as TemporaryChangeRow[],
        );
        prevInvoiceAmount = roundingEnabled ? Math.floor(totalRaw / 10) * 10 : totalRaw;
      }

      const prevPaymentAmount = await sumPayments(client, customerId, prevYear, prevMonth);
      const currentPaymentAmount = await sumPayments(client, customerId, targetYear, targetMonth);
      const carryoverAmount = (prevInvoiceAmount || 0) - currentPaymentAmount;

      return Response.json({
        prev_year: prevYear,
        prev_month: prevMonth,
        prev_invoice_amount: prevInvoiceAmount,
        prev_payment_amount: prevPaymentAmount,
        current_payment_amount: currentPaymentAmount,
        carryover_amount: carryoverAmount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("ARサマリーの取得に失敗しました", message);
    }
  });
}

