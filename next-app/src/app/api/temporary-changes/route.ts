import { ZodError } from "zod";
import { badRequest, internalError } from "@/lib/api/responses";
import { parseTemporaryChange } from "@/lib/validators/temporaryChanges";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parseYearMonthFromDate, toDayOfWeek } from "@/lib/dates";
import { pushUndo, updateCustomerLedger } from "@/lib/supabaseRpc";

const safeParse = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const ensureArray = (value: unknown): number[] => {
  const parsed = safeParse(value);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => Number(item)).filter((item) => Number.isInteger(item));
  }
  return [];
};

const ensureRecord = (value: unknown): Record<string, number> => {
  const parsed = safeParse(value);
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, val]) => {
      const numeric = Number(val);
      if (!Number.isNaN(numeric)) {
        acc[key] = numeric;
      }
      return acc;
    }, {});
  }
  return {};
};

const isPatternActiveOnDate = (pattern: { start_date: string | null; end_date: string | null }, date: string) => {
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return false;

  if (pattern.start_date) {
    const start = new Date(pattern.start_date);
    if (target < start) return false;
  }
  if (pattern.end_date) {
    const end = new Date(pattern.end_date);
    if (target > end) return false;
  }
  return true;
};

export async function POST(request: Request) {
  let payload;
  try {
    const raw = await request.json();
    payload = parseTemporaryChange(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("入力値が不正です");
    }
    return internalError("入力値の解析に失敗しました");
  }

  const { customer_id, change_date, change_type, product_id, quantity, unit_price, reason } = payload;
  const { year, month } = parseYearMonthFromDate(change_date);

  return withServiceSupabase(async (client) => {
    const { data: invoice, error: invoiceError } = await client
      .from("ar_invoices")
      .select("status")
      .eq("customer_id", customer_id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (invoiceError) {
      return internalError("確定状況の確認に失敗しました", invoiceError.message);
    }
    if (invoice && invoice.status === "confirmed") {
      return badRequest("指定年月は確定済みのため臨時変更を登録できません。先に確定解除を行ってください。");
    }

    if (change_type === "add" && product_id) {
      const { data: patterns, error: patternError } = await client
        .from("delivery_patterns")
        .select("delivery_days,daily_quantities,quantity,start_date,end_date")
        .eq("customer_id", customer_id)
        .eq("product_id", product_id)
        .eq("is_active", true);

      if (patternError) {
        return internalError("臨時変更の確認に失敗しました", patternError.message);
      }

      const dayOfWeek = toDayOfWeek(change_date);

      const isScheduled = (patterns || []).some((pattern) => {
        if (!isPatternActiveOnDate(pattern, change_date)) return false;
        const deliveryDays = ensureArray(pattern.delivery_days);
        const dailyQuantities = ensureRecord(pattern.daily_quantities);
        const baseQuantity =
          dailyQuantities[String(dayOfWeek)] ??
          dailyQuantities[dayOfWeek] ??
          (pattern.quantity !== null && pattern.quantity !== undefined ? Number(pattern.quantity) : 0);
        return deliveryDays.includes(dayOfWeek) && baseQuantity > 0;
      });

      if (isScheduled) {
        return badRequest("すでに契約されている商品の臨時追加はできません");
      }
    }

    const { data, error } = await client
      .from("temporary_changes")
      .insert({
        customer_id,
        change_date,
        change_type,
        product_id: product_id ?? null,
        quantity: quantity ?? null,
        unit_price: unit_price ?? null,
        reason: reason ?? null,
      })
      .select(
        `
          id,
          customer_id,
          change_date,
          change_type,
          product_id,
          quantity,
          unit_price,
          reason,
          created_at,
          updated_at,
          products:products (
            product_name,
            unit
          )
        `,
      )
      .maybeSingle();

    if (error) {
      const constraintErrors = ["23503", "23514", "23505"];
      if (constraintErrors.includes(error.code ?? "")) {
        return badRequest("臨時変更の登録に失敗しました。入力内容を確認してください。");
      }
      return internalError("臨時変更の作成に失敗しました", error.message);
    }

    if (!data) {
      return internalError("臨時変更の作成に失敗しました");
    }

    await pushUndo(customer_id, "temporary_change", {
      operation: "create",
      change: data,
    });

    await updateCustomerLedger(customer_id, year, month);

    return Response.json({ change: data }, { status: 201 });
  });
}

