import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { withServiceSupabase } from "@/lib/supabaseServer";
import { supabase } from "@/lib/supabaseClient";

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

export async function GET() {
  const { data, error } = await supabase.from("delivery_staff").select("*").order("id");
  if (error) {
    return internalError("スタッフ一覧の取得に失敗しました", error.message);
  }
  return Response.json({ items: (data ?? []).map(normalizeStaff) });
}

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

export async function POST(request: Request) {
  let payload;
  try {
    payload = validatePayload(await request.json());
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { data, error } = await client
        .from("delivery_staff")
        .insert({
          staff_name: payload.staff_name,
          phone: payload.phone,
          email: payload.email,
          notes: payload.notes,
          course_id: payload.course_id,
        })
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("スタッフの登録に失敗しました", error.message);
      }

      await pushStaffUndo(client, "staff_create", { staff: data }, data?.id ?? null);

      return Response.json({ staff: normalizeStaff(data) }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("スタッフの登録に失敗しました", message);
    }
  });
}

