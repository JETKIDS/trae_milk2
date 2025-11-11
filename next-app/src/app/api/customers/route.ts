import { supabase } from "@/lib/supabaseClient";
import { internalError, notImplemented } from "@/lib/api/responses";

export async function GET() {
  // TODO: フィルタ／ページングのパラメータパースを実装する
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .limit(50)
    .order("custom_id");

  if (error) return internalError("顧客一覧の取得に失敗しました", error.message);

  return Response.json({ items: data });
}

export async function POST() {
  return notImplemented(
    "顧客登録 API は未実装です。Next.js 版でのマイグレーション時に実装予定です。",
  );
}

