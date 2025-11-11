import { notFound } from "next/navigation";
import { loadInvoicePreview } from "./loadInvoicePreview";
import styles from "./InvoicePreview.module.css";

type PageProps = {
  params: { customerId: string };
  searchParams?: {
    year?: string;
    month?: string;
  };
};

const parseYearMonth = (searchParams: PageProps["searchParams"]) => {
  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackMonth = now.getMonth() + 1;

  if (!searchParams) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  const parsedYear = searchParams.year ? Number(searchParams.year) : fallbackYear;
  const parsedMonth = searchParams.month ? Number(searchParams.month) : fallbackMonth;

  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  const normalizedMonth = Math.min(Math.max(Math.round(parsedMonth), 1), 12);

  return { year: Math.round(parsedYear), month: normalizedMonth };
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);

export default async function InvoicePreviewPage({ params, searchParams }: PageProps) {
  const customerId = Number(params.customerId);
  if (!Number.isFinite(customerId)) {
    notFound();
  }

  const { year, month } = parseYearMonth(searchParams);

  let data;
  try {
    data = await loadInvoicePreview(customerId, year, month);
  } catch (error) {
    console.error("[invoices] Failed to load invoice preview:", error);
    notFound();
  }

  const monthLabel = `${data.year}年${data.month}月分`;
  const billingLabel = data.summary.billing_method === "debit" ? "口座振替" : "集金";

  return (
    <main className={styles.previewWrapper}>
      <section className={styles.previewCard}>
        <header className={styles.previewHeader}>
          <div>
            <h1>{monthLabel} 請求書プレビュー</h1>
            <p className={styles.previewSub}>
              顧客: {data.customer.customer_name}（コード: {data.customer.custom_id ?? "-"}）
            </p>
          </div>
          <div className={styles.companyInfo}>
            <strong>{data.company.company_name}</strong>
            {data.company.postal_code && <span>〒{data.company.postal_code}</span>}
            {data.company.address && <span>{data.company.address}</span>}
            <span>
              TEL: {data.company.phone ?? "-"} / FAX: {data.company.fax ?? "-"}
            </span>
            {data.company.representative && <span>代表者: {data.company.representative}</span>}
          </div>
        </header>

        <div className={styles.summaryRow}>
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>請求金額</span>
            <span className={styles.summaryValue}>{formatCurrency(data.summary.total_amount)}</span>
          </div>
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>請求確定日時</span>
            <span className={styles.summaryValue}>
              {data.summary.confirmed_at
                ? new Date(data.summary.confirmed_at).toLocaleString("ja-JP")
                : "未確認"}
            </span>
          </div>
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>集金方法</span>
            <span className={styles.summaryValue}>{billingLabel}</span>
          </div>
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>端数処理</span>
            <span className={styles.summaryValue}>{data.summary.rounding_enabled ? "10円単位で切り捨て" : "なし"}</span>
          </div>
        </div>

        <section className={styles.calendarSection}>
          <h2>配達一覧</h2>
          <table className={styles.calendarTable}>
            <thead>
              <tr>
                <th>日付</th>
                <th>商品</th>
                <th>数量</th>
                <th>単価</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {data.calendar.map((day) =>
                day.products.length === 0 ? (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td colSpan={4} className={styles.calendarEmptyCell}>
                      配達なし
                    </td>
                  </tr>
                ) : (
                  day.products.map((product, index) => (
                    <tr key={`${day.date}-${product.productName}`}>
                      {index === 0 && <td rowSpan={day.products.length}>{day.date}</td>}
                      <td>{product.productName}</td>
                      <td>{product.quantity}</td>
                      <td>{formatCurrency(product.unitPrice)}</td>
                      <td>{formatCurrency(product.amount)}</td>
                    </tr>
                  ))
                ),
              )}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}

