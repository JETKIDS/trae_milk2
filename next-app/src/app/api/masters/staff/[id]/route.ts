import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { parsePathId } from "@/lib/validators/parameters";
import { withServiceSupabase } from "@/lib/supabaseServer";

const normalizeStaff = (row: Record<string, unknown>) => ({
  id: row.id,
  staff_name: row.staff_name,
  phone: row.phone,
  email: row.email,
  notes: row.notes,
  course_id: row.course_id,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const validatePayload = (body: Record<string, unknown>) => {
  if (!body || typeof body !== "object") {
    throw new Error("入力値が不正です");
  }
  if (!body.staff_name || typeof body.staff_name !== "string") {
    throw new Error("staff_name は必須です");
  }
  return {
    staff_name: body.staff_name,
    phone: typeof body.phone === "string" ? body.phone : null,
    email: typeof body.email === "string" ? body.email : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    course_id:
      body.course_id === null || body.course_id === undefined ? null : Number.parseInt(String(body.course_id), 10),
  };
};

const canDeleteStaff = async (client: SupabaseClient, staffId: number) => {
  const { data, error } = await client
    .from("customers")
    .select("id")
    .eq("staff_id", staffId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return !data;
};

const pushStaffUndo = async (
  client: SupabaseClient,
  actionType: string,
  payload: Record<string, unknown>,
  entityId: number | null,
) => {
  const { error } = await client.rpc("rpc_push_master_undo", {
    target_entity_type: "staff",
    target_entity_id: entityId,
    target_action_type: actionType,
    target_payload: payload,
    target_metadata: null,
  });
  if (error) {
    throw new Error(`スタッフの Undo 記録に失敗しました: ${error.message}`);
  }
};

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("スタッフIDが不正です");
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
        .from("delivery_staff")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) {
        return internalError("スタッフの更新前データ取得に失敗しました", fetchError.message);
      }

      if (!before) {
        return badRequest("指定されたスタッフが見つかりません");
      }

      const { data, error } = await client
        .from("delivery_staff")
        .update({
          staff_name: payload.staff_name,
          phone: payload.phone,
          email: payload.email,
          notes: payload.notes,
          course_id: payload.course_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("スタッフの更新に失敗しました", error.message);
      }

      await pushStaffUndo(client, "staff_update", { before }, id);

      return Response.json({ staff: normalizeStaff(data) });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("スタッフの更新に失敗しました", message);
    }
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let id: number;
  try {
    id = parsePathId(params.id);
  } catch {
    return badRequest("スタッフIDが不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { data: before, error: fetchError } = await client
        .from("delivery_staff")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (fetchError) {
        return internalError("スタッフ削除前のデータ取得に失敗しました", fetchError.message);
      }

      if (!before) {
        return badRequest("指定されたスタッフが見つかりません");
      }

      const deletable = await canDeleteStaff(client, id);
      if (!deletable) {
        return badRequest("このスタッフに紐づく顧客が存在するため削除できません");
      }

      const { error } = await client.from("delivery_staff").delete().eq("id", id);
      if (error) {
        return internalError("スタッフの削除に失敗しました", error.message);
      }
      await pushStaffUndo(client, "staff_delete", { deleted: before }, id);
      return Response.json({ message: "スタッフを削除しました" });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("スタッフの削除に失敗しました", message);
    }
  });
}

