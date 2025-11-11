import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// .env.local を明示的に読み込む（存在しない場合は .env を試す）
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  console.log(`[import-supabase] Loading .env.local from: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log(`[import-supabase] .env.local not found, trying .env`);
  dotenv.config(); // .env を試す
}

type Row = Record<string, unknown>;

const PREPARED_DIR = path.resolve(process.cwd(), "supabase", "prepared");

const TABLE_ORDER = [
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

const CHUNK_SIZE = 500;

function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`[import-supabase] NEXT_PUBLIC_SUPABASE_URL: ${url ? "設定済み" : "未設定"}`);
  console.log(`[import-supabase] SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? "設定済み" : "未設定"}`);

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません。.env.local ファイルを確認してください。");
  }
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません。.env.local ファイルを確認してください。");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "milk-delivery-migration-import",
      },
    },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function loadRows(tableName: string): Promise<Row[]> {
  const filePath = path.join(PREPARED_DIR, `${tableName}.json`);
  const exists = await fs.promises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    console.warn(`[import-supabase] ${filePath} が存在しません。スキップします。`);
    return [];
  }

  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw) as Row[];
}

// テーブルごとのスキーマ定義（存在するカラムのみを指定）
const TABLE_SCHEMAS: Record<string, string[]> = {
  products: [
    "id",
    "custom_id",
    "product_name",
    "manufacturer_id",
    "unit_price",
    "unit",
    "description",
    "tax_category",
    "created_at",
  ],
  // 他のテーブルは全カラムを使用（必要に応じて追加）
};

function filterRowBySchema(row: Row, tableName: string): Row {
  const schema = TABLE_SCHEMAS[tableName];
  if (!schema) {
    // スキーマ定義がない場合は全カラムを使用
    return row;
  }

  const filtered: Row = {};
  for (const key of schema) {
    if (key in row) {
      filtered[key] = row[key];
    }
  }
  return filtered;
}

async function insertTable(client: SupabaseClient, tableName: string, rows: Row[]) {
  if (rows.length === 0) {
    console.log(`[import-supabase] ${tableName}: データなし`);
    return;
  }

  // スキーマに存在するカラムのみをフィルタリング
  const filteredRows = rows.map((row) => filterRowBySchema(row, tableName));

  const batches = chunk(filteredRows, CHUNK_SIZE);
  for (const [index, batch] of batches.entries()) {
    const { error } = await client.from(tableName).insert(batch);
    if (error) {
      throw new Error(
        `[import-supabase] ${tableName} のバッチ ${index + 1}/${batches.length} でエラー: ${error.message}`,
      );
    }
  }

  console.log(`[import-supabase] ${tableName}: ${rows.length} rows inserted`);
}

async function validateForeignKeys(
  client: SupabaseClient,
  tableName: string,
  rows: Row[],
): Promise<Row[]> {
  if (
    tableName === "delivery_patterns" ||
    tableName === "temporary_changes" ||
    tableName === "ar_invoices" ||
    tableName === "ar_payments" ||
    tableName === "customer_settings"
  ) {
    // products と customers テーブルの ID を取得
    const [productsResult, customersResult] = await Promise.all([
      client.from("products").select("id"),
      client.from("customers").select("id"),
    ]);
    
    if (productsResult.error) {
      throw new Error(`products テーブルの取得に失敗しました: ${productsResult.error.message}`);
    }
    if (customersResult.error) {
      throw new Error(`customers テーブルの取得に失敗しました: ${customersResult.error.message}`);
    }
    
    const validProductIds = new Set((productsResult.data ?? []).map((p: { id: number }) => p.id));
    const validCustomerIds = new Set((customersResult.data ?? []).map((c: { id: number }) => c.id));
    
    // 無効な外部キーを持つ行をフィルタリング
    const validRows = rows.filter((row) => {
      const productId = row.product_id;
      const customerId = row.customer_id;
      
      // customer_id は必須（customer_settings の場合は customer_id が主キー）
      if (customerId == null || !validCustomerIds.has(Number(customerId))) {
        return false;
      }
      
      // product_id は null でない場合は有効な ID である必要がある（delivery_patterns, temporary_changes のみ）
      if (
        (tableName === "delivery_patterns" || tableName === "temporary_changes") &&
        productId != null &&
        !validProductIds.has(Number(productId))
      ) {
        return false;
      }
      
      return true;
    });
    
    const invalidCount = rows.length - validRows.length;
    if (invalidCount > 0) {
      console.warn(
        `[import-supabase] ${tableName}: ${invalidCount} 行が無効な外部キーのためスキップされました`,
      );
    }
    return validRows;
  }
  
  // 他のテーブルは検証不要
  return rows;
}

async function main() {
  const client = createServiceClient();

  // 既存データをクリア（逆順で削除）
  console.log("[import-supabase] 既存データをクリアしています...");
  const clearOrder = [...TABLE_ORDER].reverse();
  for (const tableName of clearOrder) {
    try {
      const { error } = await client.from(tableName).delete().neq("id", 0); // 全件削除
      if (error && !error.message.includes("does not exist")) {
        console.warn(`[import-supabase] ${tableName} のクリア中に警告: ${error.message}`);
      } else {
        console.log(`[import-supabase] ${tableName} をクリアしました`);
      }
    } catch (error) {
      // テーブルが存在しない場合は無視
      console.warn(`[import-supabase] ${tableName} のクリアをスキップしました`);
    }
  }

  console.log("[import-supabase] データインポートを開始します...");

  for (const tableName of TABLE_ORDER) {
    try {
      let rows = await loadRows(tableName);
      // 外部キー制約の検証
      rows = await validateForeignKeys(client, tableName, rows);
      await insertTable(client, tableName, rows);
    } catch (error) {
      console.error(`[import-supabase] ${tableName} でエラーが発生しました`, error);
      process.exitCode = 1;
      return;
    }
  }

  console.log("[import-supabase] completed successfully.");
  console.log(
    "[import-supabase] 注意: 明示的に ID を挿入した場合、シーケンスのリセットが必要なことがあります。",
  );
}

main().catch((error) => {
  console.error("[import-supabase] unexpected error:", error);
  process.exit(1);
});

