"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  confirmInvoiceAction,
  initialActionResult,
  registerPaymentAction,
  unconfirmInvoiceAction,
} from "./actions";
import { type CustomerDashboardData } from "./loadCustomerDetail";
import styles from "./CustomerDetail.module.css";
import { useFormState, useFormStatus } from "react-dom";

type Props = {
  data: CustomerDashboardData;
};

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0",
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const SummaryItem = ({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <div className={`${styles.summaryItem} ${highlight ? styles.summaryHighlight : ""}`}>
    <span className={styles.summaryLabel}>{label}</span>
    <span className={styles.summaryValue}>{value}</span>
  </div>
);

const SubmitButton = ({ children }: { children: React.ReactNode }) => {
  const { pending } = useFormStatus();
  return (
    <button className={styles.primaryButton} type="submit" disabled={pending}>
      {pending ? "処理中..." : children}
    </button>
  );
};

function CalendarView({ data }: { data: CustomerDashboardData["calendar"] }) {
  const cells: Array<{ type: "empty" } | { type: "day"; day: (typeof data)[number] }> = [];

  if (data.length > 0) {
    const leadingEmpty = data[0].dayOfWeek;
    for (let i = 0; i < leadingEmpty; i += 1) {
      cells.push({ type: "empty" });
    }
    data.forEach((day) => cells.push({ type: "day", day }));
    while (cells.length % 7 !== 0) {
      cells.push({ type: "empty" });
    }
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <div className={styles.calendarContainer}>
      <div className={styles.calendarHeaderRow}>
        {dayNames.map((name) => (
          <div key={name} className={styles.calendarHeaderCell}>
            {name}
          </div>
        ))}
      </div>
      <div className={styles.calendarGrid}>
        {rows.map((row, rowIndex) =>
          row.map((cell, cellIndex) =>
            cell.type === "empty" ? (
              <div key={`empty-${rowIndex}-${cellIndex}`} className={styles.calendarCellEmpty} />
            ) : (
              <div
                key={cell.day.date}
                className={`${styles.calendarCell} ${
                  cell.day.dayOfWeek === 0 || cell.day.dayOfWeek === 6 ? styles.calendarCellWeekend : ""
                }`}
              >
                <div className={styles.calendarCellHeader}>
                  <span className={styles.calendarCellDate}>{cell.day.day}</span>
                </div>
                <div className={styles.calendarCellBody}>
                  {cell.day.products.length === 0 ? (
                    <span className={styles.calendarCellEmptyText}>配達なし</span>
                  ) : (
                    <ul className={styles.calendarCellList}>
                      {cell.day.products.map((product) => (
                        <li key={product.productName} className={styles.calendarCellItem}>
                          <span className={styles.calendarProductName}>{product.productName}</span>
                          <span className={styles.calendarProductDetail}>
                            {product.quantity}
                            {product.unit ? product.unit : "本"} × ¥{product.unitPrice.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ),
          ),
        )}
      </div>
    </div>
  );
}

export default function CustomerDetailClient({ data }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();

  const [confirmState, confirmAction] = useFormState(confirmInvoiceAction, initialActionResult);
  const [unconfirmState, unconfirmAction] = useFormState(unconfirmInvoiceAction, initialActionResult);
  const [paymentState, paymentAction] = useFormState(registerPaymentAction, initialActionResult);

  useEffect(() => {
    if (confirmState.success || unconfirmState.success || paymentState.success) {
      router.refresh();
    }
  }, [confirmState.success, unconfirmState.success, paymentState.success, router]);

  const handleMonthNavigation = (direction: "prev" | "next") => {
    const current = new Date(data.year, data.month - 1, 1);
    if (direction === "prev") {
      current.setMonth(current.getMonth() - 1);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
    const year = current.getFullYear();
    const month = current.getMonth() + 1;

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("year", String(year));
    params.set("month", String(month));

    startTransition(() => {
      router.push(`/customers/${data.customer.id}?${params.toString()}`);
    });
  };

  const summary = useMemo(
    () => [
      { label: "繰越残高", value: formatCurrency(data.ledger.opening_balance) },
      { label: "当月請求額", value: formatCurrency(data.ledger.invoice_amount), highlight: true },
      { label: "当月入金額", value: formatCurrency(data.ledger.payment_amount) },
      { label: "当月合計（カレンダー）", value: formatCurrency(Math.round(data.calendarTotalAmount)) },
      { label: "来月繰越見込", value: formatCurrency(data.ledger.carryover_amount) },
    ],
    [data],
  );

  return (
    <div className={styles.wrapper}>
      <section className={styles.section}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.customerName}>{data.customer.customer_name}</h1>
            <p className={styles.customerMeta}>
              {data.customer.customer_name_kana ? `${data.customer.customer_name_kana} / ` : ""}
              {data.customer.delivery_courses?.course_name ?? "コース未設定"}（担当:
              {data.customer.delivery_staff?.staff_name ?? "未割当"}）
            </p>
            <p className={styles.customerMeta}>
              {data.customer.postal_code ? `〒${data.customer.postal_code} ` : ""}
              {data.customer.address ?? ""}
            </p>
            {data.customer.phone && <p className={styles.customerMeta}>TEL: {data.customer.phone}</p>}
          </div>
          <div className={styles.monthSwitcher}>
            <button type="button" className={styles.secondaryButton} onClick={() => handleMonthNavigation("prev")} disabled={isNavigating}>
              ← 前月
            </button>
            <span className={styles.currentMonth}>
              {data.year}年 {data.month}月
            </span>
            <button type="button" className={styles.secondaryButton} onClick={() => handleMonthNavigation("next")} disabled={isNavigating}>
              次月 →
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>月次サマリー</h2>
        <div className={styles.summaryGrid}>
          {summary.map((item) => (
            <SummaryItem
              key={item.label}
              label={item.label}
              value={item.value}
              highlight={Boolean(item.highlight)}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>請求ステータス</h2>
          <span className={styles.invoiceStatusBadge}>
            {data.invoice.confirmed ? "確定済み" : "未確定"}
          </span>
        </div>
        <p className={styles.invoiceMeta}>
          確定日時: {formatDateTime(data.invoice.confirmed_at)} / 前月:{" "}
          {data.prevInvoice?.confirmed ? `確定 (${formatDateTime(data.prevInvoice.confirmed_at)})` : "未確定"}
        </p>
        <div className={styles.actionRow}>
          <form className={styles.actionForm} action={confirmAction}>
            <input type="hidden" name="customerId" value={data.customer.id} />
            <input type="hidden" name="year" value={data.year} />
            <input type="hidden" name="month" value={data.month} />
            <input
              type="hidden"
              name="rounding_enabled"
              value={data.settings?.rounding_enabled === false ? "false" : "true"}
            />
            <SubmitButton>請求を確定</SubmitButton>
          </form>
          <form className={styles.actionForm} action={unconfirmAction}>
            <input type="hidden" name="customerId" value={data.customer.id} />
            <input type="hidden" name="year" value={data.year} />
            <input type="hidden" name="month" value={data.month} />
            <SubmitButton>確定を取り消し</SubmitButton>
          </form>
        </div>
        {(confirmState.message || unconfirmState.message) && (
          <div className={styles.feedbackRow}>
            {confirmState.message && (
              <span className={confirmState.success ? styles.feedbackSuccess : styles.feedbackError}>
                {confirmState.message}
              </span>
            )}
            {unconfirmState.message && (
              <span className={unconfirmState.success ? styles.feedbackSuccess : styles.feedbackError}>
                {unconfirmState.message}
              </span>
            )}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>入金登録</h2>
          <span className={styles.invoiceMeta}>当月入金合計: {formatCurrency(data.ledger.payment_amount)}</span>
        </div>
        <form className={styles.paymentForm} action={paymentAction}>
          <input type="hidden" name="customerId" value={data.customer.id} />
          <input type="hidden" name="year" value={data.year} />
          <input type="hidden" name="month" value={data.month} />
          <label className={styles.formField}>
            <span>入金額</span>
            <input type="number" name="amount" min="1" step="1" placeholder="1000" required />
          </label>
          <label className={styles.formField}>
            <span>方法</span>
            <select name="method" defaultValue={data.settings?.billing_method ?? "collection"}>
              <option value="collection">集金</option>
              <option value="debit">口座振替</option>
            </select>
          </label>
          <label className={`${styles.formField} ${styles.formFieldWide}`}>
            <span>備考</span>
            <input type="text" name="note" placeholder="メモ（任意）" maxLength={200} />
          </label>
          <SubmitButton>入金を登録</SubmitButton>
        </form>
        {paymentState.message && (
          <p className={paymentState.success ? styles.feedbackSuccess : styles.feedbackError}>
            {paymentState.message}
          </p>
        )}
        <div className={styles.paymentList}>
          <h3 className={styles.paymentListTitle}>入金履歴</h3>
          {data.payments.length === 0 ? (
            <p className={styles.mutedText}>当月の入金は登録されていません。</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>日時</th>
                  <th>金額</th>
                  <th>方法</th>
                  <th>備考</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDateTime(payment.created_at)}</td>
                    <td>{formatCurrency(payment.amount)}</td>
                    <td>{payment.method === "debit" ? "口座振替" : "集金"}</td>
                    <td>{payment.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>配達カレンダー</h2>
        <CalendarView data={data.calendar} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>臨時変更一覧（当月）</h2>
        {data.temporaryChanges.length === 0 ? (
          <p className={styles.mutedText}>当月の臨時変更はありません。</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>日付</th>
                <th>種別</th>
                <th>商品</th>
                <th>数量</th>
                <th>単価</th>
                <th>理由</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.temporaryChanges.map((change) => (
                <TemporaryChangeRow
                  key={change.id}
                  change={change}
                  patterns={data.patterns}
                  currentYear={data.year}
                  currentMonth={data.month}
                  onUpdated={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        )}
        <TemporaryChangeForm
          customerId={data.customer.id}
          patterns={data.patterns}
          currentYear={data.year}
          currentMonth={data.month}
          onCompleted={() => router.refresh()}
        />
      </section>
    </div>
  );
}

type TemporaryChangeFormProps = {
  customerId: number;
  patterns: CustomerDashboardData["patterns"];
  currentYear: number;
  currentMonth: number;
  onCompleted: () => void;
};

type TemporaryChangeRowProps = {
  change: CustomerDashboardData["temporaryChanges"][number];
  patterns: CustomerDashboardData["patterns"];
  currentYear: number;
  currentMonth: number;
  onUpdated: () => void;
};

function TemporaryChangeRow({ change, patterns, currentYear, currentMonth, onUpdated }: TemporaryChangeRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!confirm("この臨時変更を削除しますか？")) {
      return;
    }

    setIsDeleting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/temporary-changes/${change.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "臨時変更の削除に失敗しました。");
      }

      setMessage("臨時変更を削除しました。");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "臨時変更の削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <TemporaryChangeEditForm
        change={change}
        patterns={patterns}
        currentYear={currentYear}
        currentMonth={currentMonth}
        onSaved={() => {
          setIsEditing(false);
          onUpdated();
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <tr>
      <td>{change.change_date}</td>
      <td>
        {change.change_type === "skip" && "休配"}
        {change.change_type === "add" && "追加"}
        {change.change_type === "modify" && "本数変更"}
      </td>
      <td>{change.product_name || "-"}</td>
      <td>{change.quantity ?? "-"}</td>
      <td>{change.unit_price !== null ? formatCurrency(change.unit_price) : "-"}</td>
      <td>{change.reason ?? "-"}</td>
      <td>
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={styles.editButton}
            onClick={() => setIsEditing(true)}
            title="編集"
          >
            編集
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleDelete}
            disabled={isDeleting}
            title="削除"
          >
            {isDeleting ? "削除中..." : "削除"}
          </button>
        </div>
        {message && <p className={styles.feedbackSuccess}>{message}</p>}
        {error && <p className={styles.feedbackError}>{error}</p>}
      </td>
    </tr>
  );
}

type TemporaryChangeEditFormProps = {
  change: CustomerDashboardData["temporaryChanges"][number];
  patterns: CustomerDashboardData["patterns"];
  currentYear: number;
  currentMonth: number;
  onSaved: () => void;
  onCancel: () => void;
};

function TemporaryChangeEditForm({
  change,
  patterns,
  currentYear,
  currentMonth,
  onSaved,
  onCancel,
}: TemporaryChangeEditFormProps) {
  const [changeDate, setChangeDate] = useState(change.change_date);
  const [changeType, setChangeType] = useState<"skip" | "add" | "modify">(change.change_type);
  const [productId, setProductId] = useState<number | "">(change.product_id ?? "");
  const [quantity, setQuantity] = useState<string>(change.quantity?.toString() ?? "");
  const [unitPrice, setUnitPrice] = useState<string>(change.unit_price?.toString() ?? "");
  const [reason, setReason] = useState(change.reason ?? "");
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const requireProduct = changeType === "add" || changeType === "modify";
  const requireQuantity = changeType !== "skip";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (requireProduct && productId === "") {
      setError("対象商品の選択が必要です。");
      return;
    }
    if (requireQuantity && (quantity === "" || Number(quantity) <= 0)) {
      setError("数量は 1 以上の数値を入力してください。");
      return;
    }

    startSubmitTransition(async () => {
      try {
        const response = await fetch(`/api/temporary-changes/${change.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            change_date: changeDate,
            change_type: changeType,
            product_id: productId === "" ? null : Number(productId),
            quantity: quantity === "" ? null : Number(quantity),
            unit_price: unitPrice === "" ? null : Number(unitPrice),
            reason: reason.trim() || null,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "臨時変更の更新に失敗しました。");
        }

        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "臨時変更の更新に失敗しました。");
      }
    });
  };

  return (
    <tr>
      <td colSpan={7}>
        <form className={styles.temporaryFormGrid} onSubmit={handleSubmit}>
          <label>
            <span>対象日</span>
            <input
              type="date"
              value={changeDate}
              onChange={(event) => setChangeDate(event.target.value)}
              min={`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`}
              max={`${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(
                new Date(currentYear, currentMonth, 0).getDate(),
              ).padStart(2, "0")}`}
              required
            />
          </label>
          <label>
            <span>操作種別</span>
            <select value={changeType} onChange={(event) => setChangeType(event.target.value as typeof changeType)}>
              <option value="skip">休配（配達なし）</option>
              <option value="add">臨時追加</option>
              <option value="modify">本数変更</option>
            </select>
          </label>
          <label>
            <span>商品</span>
            <select
              value={productId === "" ? "" : String(productId)}
              onChange={(event) => setProductId(event.target.value === "" ? "" : Number(event.target.value))}
              disabled={!requireProduct}
            >
              <option value="">選択してください</option>
              {patterns.map((pattern) => (
                <option key={pattern.id} value={pattern.product_id}>
                  {pattern.product_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>数量</span>
            <input
              type="number"
              value={quantity}
              min={requireQuantity ? 1 : 0}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={!requireQuantity}
              placeholder="例: 2"
            />
          </label>
          <label>
            <span>単価（任意）</span>
            <input
              type="number"
              value={unitPrice}
              min="0"
              step="1"
              onChange={(event) => setUnitPrice(event.target.value)}
              placeholder="例: 180"
            />
          </label>
          <label className={styles.temporaryFormWide}>
            <span>理由（任意）</span>
            <input
              type="text"
              value={reason}
              maxLength={100}
              onChange={(event) => setReason(event.target.value)}
              placeholder="例: 祝日でお休み"
            />
          </label>
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "更新中..." : "更新"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={isSubmitting}>
              キャンセル
            </button>
          </div>
        </form>
        {error && <p className={styles.feedbackError}>{error}</p>}
      </td>
    </tr>
  );
}

function TemporaryChangeForm({ customerId, patterns, currentYear, currentMonth, onCompleted }: TemporaryChangeFormProps) {
  const [changeDate, setChangeDate] = useState(
    `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`,
  );
  const [changeType, setChangeType] = useState<"skip" | "add" | "modify">("skip");
  const [productId, setProductId] = useState<number | "">("");
  const [quantity, setQuantity] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [reason, setReason] = useState("");
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [changeType, productId, quantity, unitPrice, reason, changeDate]);

  const requireProduct = changeType === "add" || changeType === "modify";
  const requireQuantity = changeType !== "skip";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (requireProduct && productId === "") {
      setError("対象商品の選択が必要です。");
      return;
    }
    if (requireQuantity && (quantity === "" || Number(quantity) <= 0)) {
      setError("数量は 1 以上の数値を入力してください。");
      return;
    }

    startSubmitTransition(async () => {
      try {
        const response = await fetch("/api/temporary-changes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_id: customerId,
            change_date: changeDate,
            change_type: changeType,
            product_id: productId === "" ? null : Number(productId),
            quantity: quantity === "" ? null : Number(quantity),
            unit_price: unitPrice === "" ? null : Number(unitPrice),
            reason: reason.trim() || null,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "臨時変更の登録に失敗しました。");
        }

        setMessage("臨時変更を登録しました。");
        setError(null);
        setQuantity("");
        setUnitPrice("");
        setReason("");
        onCompleted();
      } catch (err) {
        setError(err instanceof Error ? err.message : "臨時変更の登録に失敗しました。");
      }
    });
  };

  return (
    <div className={styles.temporaryForm}>
      <h3 className={styles.sectionSubtitle}>臨時変更の登録</h3>
      <form className={styles.temporaryFormGrid} onSubmit={handleSubmit}>
        <label>
          <span>対象日</span>
          <input
            type="date"
            value={changeDate}
            onChange={(event) => setChangeDate(event.target.value)}
            min={`${currentYear}-${String(currentMonth).padStart(2, "0")}-01`}
            max={`${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(
              new Date(currentYear, currentMonth, 0).getDate(),
            ).padStart(2, "0")}`}
            required
          />
        </label>
        <label>
          <span>操作種別</span>
          <select value={changeType} onChange={(event) => setChangeType(event.target.value as typeof changeType)}>
            <option value="skip">休配（配達なし）</option>
            <option value="add">臨時追加</option>
            <option value="modify">本数変更</option>
          </select>
        </label>
        <label>
          <span>商品</span>
          <select
            value={productId === "" ? "" : String(productId)}
            onChange={(event) => setProductId(event.target.value === "" ? "" : Number(event.target.value))}
            disabled={!requireProduct}
          >
            <option value="">選択してください</option>
            {patterns.map((pattern) => (
              <option key={pattern.id} value={pattern.product_id}>
                {pattern.product_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>数量</span>
          <input
            type="number"
            value={quantity}
            min={requireQuantity ? 1 : 0}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={!requireQuantity}
            placeholder="例: 2"
          />
        </label>
        <label>
          <span>単価（任意）</span>
          <input
            type="number"
            value={unitPrice}
            min="0"
            step="1"
            onChange={(event) => setUnitPrice(event.target.value)}
            placeholder="例: 180"
          />
        </label>
        <label className={styles.temporaryFormWide}>
          <span>理由（任意）</span>
          <input
            type="text"
            value={reason}
            maxLength={100}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例: 祝日でお休み"
          />
        </label>
        <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "登録中..." : "臨時変更を登録"}
        </button>
      </form>
      {message && <p className={styles.feedbackSuccess}>{message}</p>}
      {error && <p className={styles.feedbackError}>{error}</p>}
    </div>
  );
}

