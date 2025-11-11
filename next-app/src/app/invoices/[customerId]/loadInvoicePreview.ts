import moment from "moment";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { generateMonthlyCalendar } from "@/lib/calendar/generateMonthlyCalendar";

type CompanyInfo = {
  company_name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  representative: string | null;
};

type CustomerInfo = {
  id: number;
  custom_id: string | null;
  customer_name: string;
  address: string | null;
  phone: string | null;
  course_name: string | null;
  delivery_order: number | null;
  staff_name: string | null;
};

type CalendarProduct = {
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string | null;
  amount: number;
};

type CalendarDay = {
  date: string;
  day: number;
  dayOfWeek: number;
  products: CalendarProduct[];
};

type InvoiceSummary = {
  rounding_enabled: boolean;
  billing_method: "collection" | "debit";
  total_amount: number;
  confirmed_at: string | null;
};

type InvoicePreviewData = {
  company: CompanyInfo;
  customer: CustomerInfo;
  year: number;
  month: number;
  calendar: CalendarDay[];
  summary: InvoiceSummary;
};

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return 0;
};

export async function loadInvoicePreview(customerId: number, year: number, month: number): Promise<InvoicePreviewData> {
  return withServiceSupabase(async (client) => {
    const { data: company, error: companyError } = await client
      .from("company_info")
      .select(
        `
          company_name,
          postal_code,
          address,
          phone,
          fax,
          email,
          representative
        `,
      )
      .eq("id", 1)
      .maybeSingle();

    if (companyError) {
      throw new Error(`会社情報の取得に失敗しました: ${companyError.message}`);
    }

    const { data: customerRow, error: customerError } = await client
      .from("customers")
      .select(
        `
          id,
          custom_id,
          customer_name,
          address,
          phone,
          delivery_order,
          delivery_courses:delivery_courses (
            course_name
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

    if (!customerRow) {
      throw new Error("顧客情報が見つかりませんでした。");
    }

    const { data: invoiceRow, error: invoiceError } = await client
      .from("ar_invoices")
      .select("status, amount, rounding_enabled, confirmed_at")
      .eq("customer_id", customerId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (invoiceError) {
      throw new Error(`請求ステータスの取得に失敗しました: ${invoiceError.message}`);
    }

    if (!invoiceRow || invoiceRow.status !== "confirmed") {
      throw new Error("対象月は未確定のため請求書を生成できません。");
    }

    const { data: settings } = await client
      .from("customer_settings")
      .select("billing_method, rounding_enabled")
      .eq("customer_id", customerId)
      .maybeSingle();

    const monthStart = moment({ year, month: month - 1, day: 1 }).startOf("month").format("YYYY-MM-DD");
    const monthEnd = moment(monthStart).endOf("month").format("YYYY-MM-DD");

    const { data: patterns, error: patternError } = await client
      .from("delivery_patterns")
      .select(
        `
          product_id,
          unit_price,
          delivery_days,
          daily_quantities,
          quantity,
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
      throw new Error(`臨時変更の取得に失敗しました: ${tempError.message}`);
    }

    const patternRows = (patterns ?? []).map((pattern) => ({
      product_id: pattern.product_id,
      product_name: pattern.products?.product_name ?? "",
      unit: pattern.products?.unit ?? null,
      unit_price: Number(pattern.unit_price ?? 0),
      delivery_days: pattern.delivery_days,
      daily_quantities: pattern.daily_quantities,
      start_date: pattern.start_date,
      end_date: pattern.end_date,
      quantity: pattern.quantity,
    }));

    const tempRows = (tempChanges ?? []).map((change) => ({
      change_date: change.change_date,
      change_type: change.change_type,
      product_id: change.product_id,
      product_name: change.products?.product_name ?? "",
      quantity: change.quantity,
      unit_price: change.unit_price,
      product_unit_price: change.products?.unit_price ?? null,
      unit: change.products?.unit ?? null,
      created_at: change.created_at ?? null,
    }));

    const calendar = generateMonthlyCalendar(year, month, patternRows, tempRows ?? []);

    const rawTotal = calendar.reduce(
      (total, day) => total + day.products.reduce((subtotal, product) => subtotal + product.amount, 0),
      0,
    );

    const roundingEnabled =
      settings?.rounding_enabled === null || settings?.rounding_enabled === undefined
        ? Boolean(invoiceRow.rounding_enabled ?? true)
        : Boolean(settings.rounding_enabled);

    const totalAmount = roundingEnabled ? Math.floor(rawTotal / 10) * 10 : rawTotal;

    return {
      company: {
        company_name: company?.company_name ?? "",
        postal_code: company?.postal_code ?? null,
        address: company?.address ?? null,
        phone: company?.phone ?? null,
        fax: company?.fax ?? null,
        email: company?.email ?? null,
        representative: company?.representative ?? null,
      },
      customer: {
        id: customerRow.id,
        custom_id: customerRow.custom_id ?? null,
        customer_name: customerRow.customer_name,
        address: customerRow.address ?? null,
        phone: customerRow.phone ?? null,
        course_name: customerRow.delivery_courses?.course_name ?? null,
        delivery_order: customerRow.delivery_order ?? null,
        staff_name: customerRow.delivery_staff?.staff_name ?? null,
      },
      year,
      month,
      calendar,
      summary: {
        rounding_enabled: roundingEnabled,
        billing_method: settings?.billing_method === "debit" ? "debit" : "collection",
        total_amount: normalizeNumber(invoiceRow.amount ?? totalAmount),
        confirmed_at: invoiceRow.confirmed_at ?? null,
      },
    };
  });
}

