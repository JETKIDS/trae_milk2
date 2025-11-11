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
        "X-Client-Info": "milk-delivery-migration-verify",
      },
    },
  });
}

async function countPrepared(tableName: string): Promise<number> {
  const filePath = path.join(PREPARED_DIR, `${tableName}.json`);
  const exists = await fs.promises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
  if (!exists) return 0;

  const raw = await fs.promises.readFile(filePath, "utf8");
  const rows: Row[] = JSON.parse(raw);
  return rows.length;
}

async function countSupabase(client: ReturnType<typeof createServiceClient>, tableName: string) {
  const { count, error } = await client.from(tableName).select("*", { count: "exact", head: true });
  if (error) {
    throw new Error(`${tableName} の件数取得に失敗しました: ${error.message}`);
  }
  return count ?? 0;
}

async function main() {
  const client = createServiceClient();

  const summaries = [];

  for (const tableName of TABLES) {
    try {
      const preparedCount = await countPrepared(tableName);
      const supabaseCount = await countSupabase(client, tableName);
      const diff = supabaseCount - preparedCount;
      summaries.push({ tableName, preparedCount, supabaseCount, diff });
    } catch (error) {
      console.error(`[verify-migration] ${tableName} の確認中にエラーが発生しました`, error);
      process.exitCode = 1;
      return;
    }
  }

  console.table(
    summaries.map((s) => ({
      table: s.tableName,
      prepared: s.preparedCount,
      supabase: s.supabaseCount,
      diff: s.diff,
    })),
  );

  const mismatched = summaries.filter((s) => s.diff !== 0);
  if (mismatched.length === 0) {
    console.log("[verify-migration] すべてのテーブルで件数が一致しました。");
  } else {
    console.warn("[verify-migration] 件数が一致しないテーブルがあります。");
  }
}

main().catch((error) => {
  console.error("[verify-migration] unexpected error:", error);
  process.exit(1);
});

