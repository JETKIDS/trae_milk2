import { ZodError } from "zod";
import { badRequest, internalError } from "@/lib/api/responses";
import { parsePathId } from "@/lib/validators/parameters";
import { parseTemporaryChange } from "@/lib/validators/temporaryChanges";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { parseYearMonthFromDate, toDayOfWeek } from "@/lib/dates";
import { pushUndo, updateCustomerLedger } from "@/lib/supabaseRpc";

const ensureArray = (value: unknown): number[] => {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[]).map((item) => Number(item)).filter((item) => Number.isInteger(item));
      }
    } catch {
      return [];
    }
  }
  return [];
};

const ensureRecord = (value: unknown): Record<string, number> => {
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, Number(val || 0)]),
    );
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([key, val]) => [key, Number(val || 0)]),
        );
      }
    } catch {
      return {};
    }
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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("臨時変更IDが不正です");
  }

  let payload;
  try {
    payload = parseTemporaryChange(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("入力値が不正です");
    }
    return internalError("入力値の解析に失敗しました");
  }

  const { year: newYear, month: newMonth } = parseYearMonthFromDate(payload.change_date);

  return withServiceSupabase(async (client) => {
    const { data: existingRow, error: existingError } = await client
      .from("temporary_changes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return internalError("既存データの取得に失敗しました", existingError.message);
    }
    if (!existingRow) {
      return badRequest("臨時変更が見つかりません");
    }

    const { year: oldYear, month: oldMonth } = parseYearMonthFromDate(existingRow.change_date);

    const { data: newInvoice, error: newInvoiceError } = await client
      .from("ar_invoices")
      .select("status")
      .eq("customer_id", existingRow.customer_id)
      .eq("year", newYear)
      .eq("month", newMonth)
      .maybeSingle();
    if (newInvoiceError) {
      return internalError("確定状況の確認に失敗しました", newInvoiceError.message);
    }
    if (newInvoice && newInvoice.status === "confirmed") {
      return badRequest("指定年月は確定済みのため臨時変更を更新できません。先に確定解除を行ってください。");
    }

    if (oldYear !== newYear || oldMonth !== newMonth) {
      const { data: oldInvoice, error: oldInvoiceError } = await client
        .from("ar_invoices")
        .select("status")
        .eq("customer_id", existingRow.customer_id)
        .eq("year", oldYear)
        .eq("month", oldMonth)
        .maybeSingle();
      if (oldInvoiceError) {
        return internalError("確定状況の確認に失敗しました", oldInvoiceError.message);
      }
      if (oldInvoice && oldInvoice.status === "confirmed") {
        return badRequest("指定年月は確定済みのため臨時変更を更新できません。先に確定解除を行ってください。");
      }
    }

    if (payload.change_type === "add" && payload.product_id) {
      const { data: patterns, error: patternError } = await client
        .from("delivery_patterns")
        .select("delivery_days,daily_quantities,quantity,start_date,end_date")
        .eq("customer_id", existingRow.customer_id)
        .eq("product_id", payload.product_id)
        .eq("is_active", true);
      if (patternError) {
        return internalError("臨時変更の確認に失敗しました", patternError.message);
      }
      const dow = toDayOfWeek(payload.change_date);
      const hasConflict = (patterns || []).some((pattern) => {
        if (!isPatternActiveOnDate(pattern, payload.change_date)) return false;
        const days = ensureArray(pattern.delivery_days);
        const quantities = ensureRecord(pattern.daily_quantities);
        const baseQty =
          quantities[String(dow)] ?? quantities[dow] ?? (pattern.quantity !== null ? Number(pattern.quantity) : 0);
        return days.includes(dow) && baseQty > 0;
      });
      if (hasConflict) {
        return badRequest("すでに契約されている商品の臨時追加はできません");
      }
    }

    await pushUndo(existingRow.customer_id, "temporary_change", {
      operation: "update",
      before: existingRow,
    });

    const { error: updateError } = await client
      .from("temporary_changes")
      .update({
        change_date: payload.change_date,
        change_type: payload.change_type,
        product_id: payload.product_id ?? null,
        quantity: payload.quantity ?? null,
        unit_price: payload.unit_price ?? null,
        reason: payload.reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      const constraintErrors = ["23503", "23514"];
      if (constraintErrors.includes(updateError.code ?? "")) {
        return badRequest("臨時変更の更新に失敗しました。入力内容を確認してください。");
      }
      return internalError("臨時変更の更新に失敗しました", updateError.message);
    }

    if (oldYear !== newYear || oldMonth !== newMonth) {
      await updateCustomerLedger(existingRow.customer_id, oldYear, oldMonth);
    }
    await updateCustomerLedger(existingRow.customer_id, newYear, newMonth);

    return Response.json({ message: "臨時変更が更新されました" });
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("臨時変更IDが不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data: existingRow, error: existingError } = await client
      .from("temporary_changes")
      .select("customer_id, change_date")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return internalError("既存データの取得に失敗しました", existingError.message);
    }
    if (!existingRow) {
      return badRequest("臨時変更が見つかりません");
    }

    const { year, month } = parseYearMonthFromDate(existingRow.change_date);
    const { data: invoice, error: invoiceError } = await client
      .from("ar_invoices")
      .select("status")
      .eq("customer_id", existingRow.customer_id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (invoiceError) {
      return internalError("確定状況の確認に失敗しました", invoiceError.message);
    }
    if (invoice && invoice.status === "confirmed") {
      return badRequest("指定年月は確定済みのため臨時変更を削除できません。先に確定解除を行ってください。");
    }

    const { error: deleteError } = await client.from("temporary_changes").delete().eq("id", id);
    if (deleteError) {
      return internalError("臨時変更の削除に失敗しました", deleteError.message);
    }

    await pushUndo(existingRow.customer_id, "temporary_change", {
      operation: "delete",
      before: existingRow,
    });

    await updateCustomerLedger(existingRow.customer_id, year, month);

    return Response.json({ message: "臨時変更が削除されました" });
  });
}

