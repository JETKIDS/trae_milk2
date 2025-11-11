import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// .env.local を明示的に読み込む
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

type Row = Record<string, unknown>;

const PREPARED_DIR = path.resolve(process.cwd(), "supabase", "prepared");

const TABLES = [
  "manufacturers",
  "products",
  "delivery_courses",
  "delivery_staff",
  "staff_courses",
  "company_info",
  "institution_info",
  "customers",
  "customer_settings",
  "delivery_patterns",
  "temporary_changes",
  "operation_logs",
  "ar_invoices",
  "ar_payments",
  "ar_ledger",
];

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません。");
  }
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません。");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "milk-delivery-migration-verify-detailed",
      },
    },
  });
}

async function loadPreparedRows(tableName: string): Promise<Row[]> {
  const filePath = path.join(PREPARED_DIR, `${tableName}.json`);
  const exists = await fs.promises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
  if (!exists) return [];

  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw) as Row[];
}

async function loadSupabaseRows(
  client: ReturnType<typeof createServiceClient>,
  tableName: string,
): Promise<Row[]> {
  const { data, error } = await client.from(tableName).select("*");
  if (error) {
    throw new Error(`${tableName} のデータ取得に失敗しました: ${error.message}`);
  }
  return (data ?? []) as Row[];
}

function compareRows(prepared: Row[], supabase: Row[], keyField: string = "id") {
  const preparedMap = new Map<string | number, Row>();
  const supabaseMap = new Map<string | number, Row>();

  for (const row of prepared) {
    const key = row[keyField];
    if (key != null) {
      preparedMap.set(String(key), row);
    }
  }

  for (const row of supabase) {
    const key = row[keyField];
    if (key != null) {
      supabaseMap.set(String(key), row);
    }
  }

  const onlyInPrepared: string[] = [];
  const onlyInSupabase: string[] = [];
  const different: Array<{ key: string | number; field: string; prepared: unknown; supabase: unknown }> = [];

  for (const [key, prepRow] of preparedMap.entries()) {
    const supRow = supabaseMap.get(key);
    if (!supRow) {
      onlyInPrepared.push(String(key));
      continue;
    }

    // 主要フィールドを比較（ID 以外）
    for (const [field, prepValue] of Object.entries(prepRow)) {
      if (field === keyField) continue;
      const supValue = supRow[field];

      // 数値の比較（浮動小数点の誤差を考慮）
      if (typeof prepValue === "number" && typeof supValue === "number") {
        if (Math.abs(prepValue - supValue) > 0.01) {
          different.push({ key, field, prepared: prepValue, supabase: supValue });
        }
      } else if (JSON.stringify(prepValue) !== JSON.stringify(supValue)) {
        different.push({ key, field, prepared: prepValue, supabase: supValue });
      }
    }
  }

  for (const [key] of supabaseMap.entries()) {
    if (!preparedMap.has(key)) {
      onlyInSupabase.push(String(key));
    }
  }

  return { onlyInPrepared, onlyInSupabase, different };
}

async function verifyTable(
  client: ReturnType<typeof createServiceClient>,
  tableName: string,
  keyField: string = "id",
) {
  const prepared = await loadPreparedRows(tableName);
  const supabase = await loadSupabaseRows(client, tableName);

  const countMatch = prepared.length === supabase.length;
  const comparison = compareRows(prepared, supabase, keyField);

  return {
    tableName,
    preparedCount: prepared.length,
    supabaseCount: supabase.length,
    countMatch,
    comparison,
  };
}

async function main() {
  const client = createServiceClient();

  console.log("[verify-detailed] 詳細検証を開始します...\n");

  const results = [];

  for (const tableName of TABLES) {
    try {
      const keyField = tableName === "customer_settings" ? "customer_id" : "id";
      const result = await verifyTable(client, tableName, keyField);
      results.push(result);

      console.log(`[verify-detailed] ${tableName}:`);
      console.log(`  準備済み: ${result.preparedCount} 件`);
      console.log(`  Supabase: ${result.supabaseCount} 件`);
      console.log(`  件数一致: ${result.countMatch ? "✓" : "✗"}`);

      if (result.comparison.onlyInPrepared.length > 0) {
        console.log(`  警告: 準備済みにのみ存在: ${result.comparison.onlyInPrepared.slice(0, 5).join(", ")}${result.comparison.onlyInPrepared.length > 5 ? "..." : ""}`);
      }
      if (result.comparison.onlyInSupabase.length > 0) {
        console.log(`  警告: Supabase にのみ存在: ${result.comparison.onlyInSupabase.slice(0, 5).join(", ")}${result.comparison.onlyInSupabase.length > 5 ? "..." : ""}`);
      }
      if (result.comparison.different.length > 0) {
        console.log(`  警告: データ不一致が ${result.comparison.different.length} 件見つかりました（最初の3件を表示）:`);
        for (const diff of result.comparison.different.slice(0, 3)) {
          console.log(`    - ${tableName}[${diff.key}].${diff.field}: 準備済み=${JSON.stringify(diff.prepared)}, Supabase=${JSON.stringify(diff.supabase)}`);
        }
      }

      console.log("");
    } catch (error) {
      console.error(`[verify-detailed] ${tableName} の検証中にエラーが発生しました:`, error);
      process.exitCode = 1;
    }
  }

  const allMatch = results.every((r) => r.countMatch && r.comparison.onlyInPrepared.length === 0 && r.comparison.onlyInSupabase.length === 0 && r.comparison.different.length === 0);

  if (allMatch) {
    console.log("[verify-detailed] ✓ すべてのテーブルでデータが一致しました。");
  } else {
    console.warn("[verify-detailed] ✗ 一部のテーブルで不一致が見つかりました。上記の警告を確認してください。");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[verify-detailed] unexpected error:", error);
  process.exit(1);
});

