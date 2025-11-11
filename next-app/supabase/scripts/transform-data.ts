import fs from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;

const EXPORT_DIR = path.resolve(process.cwd(), "supabase", "exports");
const OUTPUT_DIR = path.resolve(process.cwd(), "supabase", "prepared");

const defaultTransformer = (rows: Row[]) => rows;

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return null;
};

const transformers: Record<string, (rows: Row[]) => Row[]> = {
  delivery_patterns: (rows) =>
    rows.map((row) => ({
      ...row,
      delivery_days: parseMaybeJson(row.delivery_days),
      daily_quantities: parseMaybeJson(row.daily_quantities),
      is_active: toBoolean(row.is_active) ?? true, // null の場合は true をデフォルト値として使用
    })),
  temporary_changes: (rows) =>
    rows.map((row) => ({
      ...row,
      quantity: row.quantity === null ? null : Number(row.quantity),
    })),
  customer_settings: (rows) =>
    rows.map((row) => ({
      ...row,
      rounding_enabled: toBoolean(row.rounding_enabled),
    })),
  ar_invoices: (rows) =>
    rows.map((row) => ({
      ...row,
      rounding_enabled: toBoolean(row.rounding_enabled),
    })),
  ar_ledger: (rows) =>
    rows.map((row) => ({
      ...row,
      opening_balance: Number(row.opening_balance ?? 0),
      invoice_amount: Number(row.invoice_amount ?? 0),
      payment_amount: Number(row.payment_amount ?? 0),
      carryover_amount: Number(row.carryover_amount ?? 0),
    })),
};

function parseMaybeJson(value: unknown) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

async function transformTable(fileName: string) {
  const sourcePath = path.join(EXPORT_DIR, fileName);
  const outputPath = path.join(OUTPUT_DIR, fileName);

  const raw = await fs.promises.readFile(sourcePath, "utf8");
  const rows: Row[] = JSON.parse(raw);

  const tableName = path.basename(fileName, path.extname(fileName));
  const transformer = transformers[tableName] ?? defaultTransformer;
  const transformed = transformer(rows);

  await fs.promises.writeFile(outputPath, JSON.stringify(transformed, null, 2), "utf8");
  console.log(`[transform-data] ${tableName}: ${rows.length} rows transformed -> ${outputPath}`);
}

async function main() {
  const files = await fs.promises.readdir(EXPORT_DIR);
  if (files.length === 0) {
    console.warn("[transform-data] exports ディレクトリにファイルがありません。先に migrate:export を実行してください。");
    return;
  }

  await ensureOutputDir();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      await transformTable(file);
    } catch (error) {
      console.error(`[transform-data] failed to transform ${file}:`, error);
    }
  }

  console.log("[transform-data] done.");
}

main().catch((error) => {
  console.error("[transform-data] unexpected error:", error);
  process.exit(1);
});

