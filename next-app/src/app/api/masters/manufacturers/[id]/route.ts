import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { parsePathId } from "@/lib/validators/parameters";
import { withServiceSupabase } from "@/lib/supabaseServer";

const normalizeManufacturer = (row: Record<string, unknown>) => ({
  id: row.id,
  manufacturer_name: row.manufacturer_name,
  contact_info: row.contact_info,
  notes: row.notes,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const validatePayload = (body: Record<string, unknown>) => {
  if (!body || typeof body !== "object") {
    throw new Error("入力値が不正です");
  }
  if (!body.manufacturer_name || typeof body.manufacturer_name !== "string") {
    throw new Error("manufacturer_name は必須です");
  }
  return {
    manufacturer_name: body.manufacturer_name,
    contact_info: typeof body.contact_info === "string" ? body.contact_info : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
};

const pushManufacturerUndo = async (
  client: SupabaseClient,
  actionType: string,
  payload: Record<string, unknown>,
  entityId: number | null,
) => {
  const { error } = await client.rpc("rpc_push_master_undo", {
    target_entity_type: "manufacturer",
    target_entity_id: entityId,
    target_action_type: actionType,
    target_payload: payload,
    target_metadata: null,
  });
  if (error) {
    throw new Error(`メーカーの Undo 記録に失敗しました: ${error.message}`);
  }
};

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("メーカーIDが不正です");
  }

  let payload;
  try {
    payload = validatePayload(await request.json());
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { data: before, error: fetchError } = await client
        .from("manufacturers")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) {
        return internalError("メーカーの更新前データ取得に失敗しました", fetchError.message);
      }

      if (!before) {
        return badRequest("指定されたメーカーが見つかりません");
      }

      const { data, error } = await client
        .from("manufacturers")
        .update({
          manufacturer_name: payload.manufacturer_name,
          contact_info: payload.contact_info,
          notes: payload.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("メーカーの更新に失敗しました", error.message);
      }

      await pushManufacturerUndo(client, "manufacturer_update", { before }, id);

      return Response.json({ manufacturer: normalizeManufacturer(data) });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("メーカーの更新に失敗しました", message);
    }
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("メーカーIDが不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { data, error } = await client.from("products").select("id").eq("manufacturer_id", id).limit(1).maybeSingle();
      if (error) {
        return internalError("メーカー削除時の参照チェックに失敗しました", error.message);
      }
      if (data) {
        return badRequest("このメーカーに紐づく商品が存在するため削除できません");
      }

      const { data: before, error: fetchError } = await client
        .from("manufacturers")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) {
        return internalError("メーカー削除前のデータ取得に失敗しました", fetchError.message);
      }

      if (!before) {
        return badRequest("指定されたメーカーが見つかりません");
      }

      const { error: deleteError } = await client.from("manufacturers").delete().eq("id", id);
      if (deleteError) {
        return internalError("メーカーの削除に失敗しました", deleteError.message);
      }

      await pushManufacturerUndo(client, "manufacturer_delete", { deleted: before }, id);

      return Response.json({ message: "メーカーを削除しました" });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("メーカーの削除に失敗しました", message);
    }
  });
}

