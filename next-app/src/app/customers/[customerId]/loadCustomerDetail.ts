import moment from "moment";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { generateMonthlyCalendar, CalendarDay } from "@/lib/calendar/generateMonthlyCalendar";
import { getPrevYearMonth } from "@/lib/dates";

type CustomerRow = {
  id: number;
  customer_name: string;
  customer_name_kana?: string | null;
  postal_code?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  course_id?: number | null;
  staff_id?: number | null;
  delivery_courses?: { course_name?: string | null; custom_id?: string | null } | null;
  delivery_staff?: { staff_name?: string | null } | null;
  [key: string]: unknown;
};

type CustomerSettingsRow = {
  billing_method: "collection" | "debit" | null;
  rounding_enabled: boolean | null;
  bank_code: string | null;
  branch_code: string | null;
  account_type: number | null;
  account_number: string | null;
  account_holder_katakana: string | null;
};

type TemporaryChangeItem = {
  id: number;
  change_date: string;
  change_type: "skip" | "add" | "modify";
  product_id: number | null;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  unit: string | null;
  reason: string | null;
  created_at: string | null;
};

type PatternOption = {
  id: number;
  product_id: number;
  product_name: string;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
};

type InvoiceStatus = {
  confirmed: boolean;
  confirmed_at: string | null;
  rounding_enabled: boolean;
  amount: number | null;
};

type LedgerSummary = {
  opening_balance: number;
  invoice_amount: number;
  payment_amount: number;
  carryover_amount: number;
};

type PaymentItem = {
  id: number;
  amount: number;
  method: "collection" | "debit" | null;
  note: string | null;
  created_at: string;
};

export type CustomerDashboardData = {
  customer: CustomerRow;
  settings: CustomerSettingsRow | null;
  year: number;
  month: number;
  calendar: CalendarDay[];
  temporaryChanges: TemporaryChangeItem[];
  invoice: InvoiceStatus;
  prevInvoice: InvoiceStatus | null;
  ledger: LedgerSummary;
  payments: PaymentItem[];
  calendarTotalAmount: number;
  patterns: PatternOption[];
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
};

export async function loadCustomerDetail(
  customerId: number,
  year: number,
  month: number,
): Promise<CustomerDashboardData> {
  return withServiceSupabase(async (client) => {
    const { data: customer, error: customerError } = await client
      .from("customers")
      .select(
        `
          *,
          delivery_courses:delivery_courses (
            course_name,
            custom_id
          ),
          delivery_staff:delivery_staff (
            staff_name
          )
        `,
      )
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) {
      throw new Error(`顧客情報の取得に失敗しました: ${customerError.message}`);
    }
    if (!customer) {
      throw new Error("顧客情報が見つかりませんでした。");
    }

    const { data: settings, error: settingsError } = await client
      .from("customer_settings")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (settingsError) {
      throw new Error(`請求設定の取得に失敗しました: ${settingsError.message}`);
    }

    const { data: patterns, error: patternError } = await client
      .from("delivery_patterns")
      .select(
        `
          id,
          product_id,
          quantity,
          unit_price,
          delivery_days,
          daily_quantities,
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
      throw new Error(`配達パターンの取得に失敗しました: ${patternError.message}`);
    }

    const monthStart = moment({ year, month: month - 1, day: 1 }).startOf("month").format("YYYY-MM-DD");
    const monthEnd = moment(monthStart).endOf("month").format("YYYY-MM-DD");

    const { data: tempChanges, error: tempError } = await client
      .from("temporary_changes")
      .select(
        `
          id,
          change_date,
          change_type,
          product_id,
          quantity,
          unit_price,
          reason,
          created_at,
          products:products (
            product_name,
            unit,
            unit_price
          )
        `,
      )
      .eq("customer_id", customerId)
      .gte("change_date", monthStart)
      .lte("change_date", monthEnd);

    if (tempError) {
      throw new Error(`臨時変更の取得に失敗しました: ${tempError.message}`);
    }

    const patternRows = (patterns ?? []).map((row) => ({
      product_id: row.product_id,
      product_name: row.products?.product_name ?? "",
      unit: row.products?.unit ?? null,
      unit_price: Number(row.unit_price ?? 0),
      delivery_days: row.delivery_days,
      daily_quantities: row.daily_quantities,
      start_date: row.start_date,
      end_date: row.end_date,
      quantity: row.quantity,
    }));

    const patternOptions: PatternOption[] = (patterns ?? []).map((row) => ({
      id: row.id as number,
      product_id: row.product_id,
      product_name: row.products?.product_name ?? "",
      unit: row.products?.unit ?? null,
      start_date: row.start_date,
      end_date: row.end_date,
    }));

    const temporaryChangeRows: TemporaryChangeItem[] = (tempChanges ?? []).map((row) => ({
      id: row.id as number,
      change_date: row.change_date,
      change_type: row.change_type,
      product_id: row.product_id,
      product_name: row.products?.product_name ?? "",
      quantity: row.quantity,
      unit_price: row.unit_price,
      unit: row.products?.unit ?? null,
      reason: row.reason ?? null,
      created_at: row.created_at ?? null,
    }));

    const calendarTemporaryRows = (tempChanges ?? []).map((row) => ({
      change_date: row.change_date,
      change_type: row.change_type,
      product_id: row.product_id,
      product_name: row.products?.product_name ?? "",
      quantity: row.quantity,
      unit_price: row.unit_price,
      product_unit_price: row.products?.unit_price ?? null,
      unit: row.products?.unit ?? null,
      created_at: row.created_at ?? null,
    }));

    const calendar = generateMonthlyCalendar(year, month, patternRows, calendarTemporaryRows);

    const calendarTotalAmount = calendar.reduce(
      (total, day) => total + day.products.reduce((subtotal, product) => subtotal + product.amount, 0),
      0,
    );

    const { data: invoiceRow, error: invoiceError } = await client
      .from("ar_invoices")
      .select("status, confirmed_at, rounding_enabled, amount")
      .eq("customer_id", customerId)
      .eq("year", year)
      .eq("month", month)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invoiceError) {
      throw new Error(`請求ステータスの取得に失敗しました: ${invoiceError.message}`);
    }

    const invoice: InvoiceStatus = {
      confirmed: invoiceRow?.status === "confirmed",
      confirmed_at: invoiceRow?.confirmed_at ?? null,
      rounding_enabled:
        invoiceRow?.rounding_enabled === undefined || invoiceRow?.rounding_enabled === null
          ? true
          : Boolean(invoiceRow.rounding_enabled),
      amount: invoiceRow?.amount ?? null,
    };

    const { year: prevYear, month: prevMonth } = getPrevYearMonth(year, month);
    const { data: prevInvoiceRow, error: prevInvoiceError } = await client
      .from("ar_invoices")
      .select("status, confirmed_at, rounding_enabled, amount")
      .eq("customer_id", customerId)
      .eq("year", prevYear)
      .eq("month", prevMonth)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevInvoiceError) {
      throw new Error(`前月請求ステータスの取得に失敗しました: ${prevInvoiceError.message}`);
    }

    const prevInvoice: InvoiceStatus | null = prevInvoiceRow
      ? {
          confirmed: prevInvoiceRow.status === "confirmed",
          confirmed_at: prevInvoiceRow.confirmed_at ?? null,
          rounding_enabled:
            prevInvoiceRow.rounding_enabled === undefined || prevInvoiceRow.rounding_enabled === null
              ? true
              : Boolean(prevInvoiceRow.rounding_enabled),
          amount: prevInvoiceRow.amount ?? null,
        }
      : null;

    const { data: ledgerRow, error: ledgerError } = await client
      .rpc("rpc_update_customer_ledger", {
        target_customer_id: customerId,
        target_year: year,
        target_month: month,
      })
      .maybeSingle();

    if (ledgerError) {
      throw new Error(`請求サマリーの取得に失敗しました: ${ledgerError.message}`);
    }

    const ledger: LedgerSummary = {
      opening_balance: normalizeNumber(ledgerRow?.opening_balance),
      invoice_amount: normalizeNumber(ledgerRow?.invoice_amount),
      payment_amount: normalizeNumber(ledgerRow?.payment_amount),
      carryover_amount: normalizeNumber(ledgerRow?.carryover_amount),
    };

    const { data: paymentRows, error: paymentError } = await client
      .from("ar_payments")
      .select("id, amount, method, note, created_at")
      .eq("customer_id", customerId)
      .eq("year", year)
      .eq("month", month)
      .order("created_at", { ascending: false });

    if (paymentError) {
      throw new Error(`入金履歴の取得に失敗しました: ${paymentError.message}`);
    }

    const payments: PaymentItem[] = (paymentRows ?? []).map((row) => ({
      id: row.id as number,
      amount: normalizeNumber(row.amount),
      method: (row.method as "collection" | "debit" | null) ?? null,
      note: row.note ?? null,
      created_at: row.created_at as string,
    }));

    return {
      customer: customer as CustomerRow,
      settings: (settings ?? null) as CustomerSettingsRow | null,
      year,
      month,
      calendar,
      temporaryChanges: temporaryChangeRows,
      invoice,
      prevInvoice,
      ledger,
      payments,
      calendarTotalAmount,
      patterns: patternOptions,
    };
  });
}

