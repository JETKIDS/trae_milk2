import { withServiceSupabase } from "@/lib/supabaseServer";
import { badRequest, internalError, notImplemented } from "@/lib/api/responses";
import { parseCustomerId } from "@/lib/validators/common";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  let customerId: number;
  try {
    customerId = parseCustomerId(params.id);
  } catch {
    return badRequest("顧客IDが不正です");
  }

  return withServiceSupabase(async (client) => {
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .maybeSingle();

    if (error) return internalError("顧客詳細の取得に失敗しました", error.message);

    if (!data) return Response.json({ error: "顧客が見つかりません" }, { status: 404 });

    return Response.json(data);
  });
}

export async function PUT() {
  return notImplemented("顧客更新 API は未実装です。移行フェーズで実装予定です。");
}

