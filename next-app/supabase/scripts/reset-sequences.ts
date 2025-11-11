import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const TABLES_WITH_SEQUENCES = [
  "delivery_courses",
  "delivery_staff",
  "manufacturers",
  "products",
  "customers",
  "delivery_patterns",
  "temporary_changes",
  "ar_invoices",
  "ar_payments",
  "ar_ledger",
  "operation_logs",
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
        "X-Client-Info": "milk-delivery-migration-reset-sequences",
      },
    },
  });
}

async function getMaxId(client: ReturnType<typeof createServiceClient>, tableName: string): Promise<number> {
  const { data: maxData, error: maxError } = await client
    .from(tableName)
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) {
    throw new Error(`${tableName} の最大 ID 取得に失敗しました: ${maxError.message}`);
  }

  return maxData?.id ? Number(maxData.id) : 0;
}

async function main() {
  const client = createServiceClient();

  console.log("[reset-sequences] シーケンスリセット用の SQL を生成します...\n");

  const sqlStatements: string[] = [];

  for (const tableName of TABLES_WITH_SEQUENCES) {
    try {
      const maxId = await getMaxId(client, tableName);
      const nextId = maxId + 1;
      const sequenceName = `${tableName}_id_seq`;
      const sql = `SELECT setval('${sequenceName}', ${nextId}, false);`;
      sqlStatements.push(sql);
      console.log(`[reset-sequences] ${tableName}: 最大 ID = ${maxId}, 次回 ID = ${nextId}`);
    } catch (error) {
      console.error(`[reset-sequences] ${tableName} の最大 ID 取得中にエラーが発生しました:`, error);
      // エラーが発生しても続行
    }
  }

  console.log("\n[reset-sequences] 以下の SQL を Supabase SQL Editor で実行してください:\n");
  console.log("-- シーケンスリセット SQL");
  console.log(sqlStatements.join("\n"));
  console.log("\n[reset-sequences] 完了しました。");
}

main().catch((error) => {
  console.error("[reset-sequences] unexpected error:", error);
  process.exit(1);
});

