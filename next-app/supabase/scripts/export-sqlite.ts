import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

const OUTPUT_DIR = path.resolve(process.cwd(), "supabase", "exports");
const SQLITE_PATH = path.resolve(process.cwd(), "..", "server", "milk_delivery.db");

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

async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

async function exportTable(db: Database, tableName: string) {
  const rows = await db.all(`SELECT * FROM ${tableName}`);
  const filePath = path.join(OUTPUT_DIR, `${tableName}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(rows, null, 2), "utf8");
  console.log(`[export-sqlite] exported ${tableName} (${rows.length} rows) -> ${filePath}`);
}

async function main() {
  console.log(`[export-sqlite] Starting export...`);
  console.log(`[export-sqlite] SQLite path: ${SQLITE_PATH}`);
  console.log(`[export-sqlite] Output dir: ${OUTPUT_DIR}`);
  
  await ensureOutputDir();
  
  try {
    const db = await open({
      filename: SQLITE_PATH,
      driver: sqlite3.Database,
    });
    console.log(`[export-sqlite] Database opened successfully`);

    // テーブル一覧を確認
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log(`[export-sqlite] Found ${tables.length} tables in database`);
    
    for (const tableName of TABLES) {
      try {
        await exportTable(db, tableName);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[export-sqlite] failed to export ${tableName}:`, errorMessage);
        // テーブルが存在しない場合は警告のみで続行
        if (errorMessage.includes("no such table")) {
          console.warn(`[export-sqlite] Table ${tableName} does not exist, skipping...`);
        }
      }
    }

    await db.close();
    console.log("[export-sqlite] done.");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[export-sqlite] Database error:`, errorMessage);
    throw error;
  }
}

main().catch((error) => {
  console.error("[export-sqlite] unexpected error:", error);
  process.exit(1);
});

