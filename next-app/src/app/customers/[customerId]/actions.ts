"use server";

import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabaseServer";

export type ActionResult = {
  success: boolean;
  message?: string;
};

export const initialActionResult: ActionResult = { success: false };

const parseNumericInput = (value: FormDataEntryValue | null, name: string) => {
  if (value === null) throw new Error(`${name} を指定してください。`);
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error(`${name} が不正です。`);
  return num;
};

const parseCustomerContext = (formData: FormData) => {
  const customerId = parseNumericInput(formData.get("customerId"), "顧客ID");
  const year = parseNumericInput(formData.get("year"), "対象年");
  const month = parseNumericInput(formData.get("month"), "対象月");
  if (month < 1 || month > 12) {
    throw new Error("対象月が不正です。");
  }
  return { customerId, year: Math.floor(year), month: Math.floor(month) };
};

const refreshCustomerPage = (customerId: number) => {
  revalidatePath(`/customers/${customerId}`);
};

export async function confirmInvoiceAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  let context;
  try {
    context = parseCustomerContext(formData);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "入力値が不正です。" };
  }

  const roundingRaw = formData.get("rounding_enabled");
  const roundingEnabled =
    roundingRaw === null ? true : typeof roundingRaw === "string" ? roundingRaw === "true" : Boolean(roundingRaw);

  try {
    const client = createServiceSupabaseClient();
    const { error } = await client
      .rpc("rpc_confirm_invoice", {
        target_customer_id: context.customerId,
        target_year: context.year,
        target_month: context.month,
        target_rounding_enabled: roundingEnabled,
      })
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    refreshCustomerPage(context.customerId);
    return { success: true, message: "請求を確定しました。" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "請求確定に失敗しました。",
    };
  }
}

export async function unconfirmInvoiceAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  let context;
  try {
    context = parseCustomerContext(formData);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "入力値が不正です。" };
  }

  try {
    const client = createServiceSupabaseClient();
    const { error } = await client
      .rpc("rpc_unconfirm_invoice", {
        target_customer_id: context.customerId,
        target_year: context.year,
        target_month: context.month,
      })
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    refreshCustomerPage(context.customerId);
    return { success: true, message: "請求の確定を取り消しました。" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "請求取消に失敗しました。",
    };
  }
}

export async function registerPaymentAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  let context;
  try {
    context = parseCustomerContext(formData);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "入力値が不正です。" };
  }

  const amountValue = formData.get("amount");
  if (amountValue === null || amountValue === "") {
    return { success: false, message: "入金額を入力してください。" };
  }

  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: "入金額は 0 より大きい数値で入力してください。" };
  }

  const methodRaw = formData.get("method");
  const method = methodRaw === "debit" ? "debit" : "collection";
  const noteRaw = formData.get("note");
  const note =
    noteRaw === null || (typeof noteRaw === "string" && noteRaw.trim() === "")
      ? null
      : noteRaw?.toString().slice(0, 200) ?? null;

  try {
    const client = createServiceSupabaseClient();
    const { error: insertError } = await client
      .from("ar_payments")
      .insert({
        customer_id: context.customerId,
        year: context.year,
        month: context.month,
        amount: Math.round(amount),
        method,
        note,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      const isConstraintError = insertError.code === "23505" || insertError.code === "23514";
      if (isConstraintError) {
        throw new Error("入金データの登録に失敗しました。入力内容を確認してください。");
      }
      throw new Error(insertError.message);
    }

    const { error: ledgerError } = await client
      .rpc("rpc_update_customer_ledger", {
        target_customer_id: context.customerId,
        target_year: context.year,
        target_month: context.month,
      })
      .maybeSingle();

    if (ledgerError) {
      throw new Error(ledgerError.message);
    }

    refreshCustomerPage(context.customerId);
    return { success: true, message: "入金を登録しました。" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "入金登録に失敗しました。",
    };
  }
}

