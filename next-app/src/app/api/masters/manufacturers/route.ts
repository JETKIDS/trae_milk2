import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { supabase } from "@/lib/supabaseClient";
import { withServiceSupabase } from "@/lib/supabaseServer";

const normalizeManufacturer = (row: Record<string, unknown>) => ({
  id: row.id,
  manufacturer_name: row.manufacturer_name,
  contact_info: row.contact_info,
  notes: row.notes,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export async function GET() {
  const { data, error } = await supabase.from("manufacturers").select("*").order("manufacturer_name");
  if (error) {
    return internalError("メーカー一覧の取得に失敗しました", error.message);
  }
  return Response.json({ items: (data ?? []).map(normalizeManufacturer) });
}

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
        .from("manufacturers")
        .insert({
          manufacturer_name: payload.manufacturer_name,
          contact_info: payload.contact_info,
          notes: payload.notes,
        })
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("メーカーの登録に失敗しました", error.message);
      }

      await pushManufacturerUndo(client, "manufacturer_create", { manufacturer: data }, data?.id ?? null);

      return Response.json({ manufacturer: normalizeManufacturer(data) }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("メーカーの登録に失敗しました", message);
    }
  });
}

