import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { supabase } from "@/lib/supabaseClient";
import { withServiceSupabase } from "@/lib/supabaseServer";

const DEFAULT_INSTITUTION = {
  id: 1,
  institution_name: "",
  bank_code_7: "",
  bank_name: "",
  branch_name: "",
  agent_name_half: "",
  agent_code: "",
  header_leading_digit: "1",
  notes: "",
};

const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;

const normalizeInstitution = (row: Record<string, unknown> | null) => ({
  ...DEFAULT_INSTITUTION,
  ...row,
});

const validatePayload = (body: Record<string, unknown>) => {
  if (!body || typeof body !== "object") {
    throw new Error("入力値が不正です");
  }

  if (body.bank_code_7 !== undefined && body.bank_code_7 !== null) {
    const value = String(body.bank_code_7);
    if (!/^\d{7}$/.test(value)) {
      throw new Error("bank_code_7 は半角数字7桁で入力してください");
    }
  }

  if (body.agent_name_half !== undefined && body.agent_name_half !== null) {
    const value = String(body.agent_name_half);
    if (value.length > 0 && !halfKanaRegex.test(value)) {
      throw new Error("agent_name_half は半角カタカナで入力してください（スペース可）");
    }
  }

  if (body.header_leading_digit !== undefined && body.header_leading_digit !== null) {
    const value = String(body.header_leading_digit);
    if (!/^\d+$/.test(value)) {
      throw new Error("header_leading_digit は半角数字で入力してください");
    }
  }

  if (body.agent_code !== undefined && body.agent_code !== null) {
    const value = String(body.agent_code);
    if (value.length > 0 && !/^\d+$/.test(value)) {
      throw new Error("agent_code は半角数字で入力してください");
    }
  }

  return {
    institution_name: typeof body.institution_name === "string" ? body.institution_name : null,
    bank_code_7: typeof body.bank_code_7 === "string" ? body.bank_code_7 : null,
    bank_name: typeof body.bank_name === "string" ? body.bank_name : null,
    branch_name: typeof body.branch_name === "string" ? body.branch_name : null,
    agent_name_half: typeof body.agent_name_half === "string" ? body.agent_name_half : null,
    agent_code: typeof body.agent_code === "string" ? body.agent_code : null,
    header_leading_digit: typeof body.header_leading_digit === "string" ? body.header_leading_digit : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
};

const pushInstitutionUndo = async (
  client: SupabaseClient,
  actionType: string,
  payload: Record<string, unknown>,
) => {
  const { error } = await client.rpc("rpc_push_master_undo", {
    target_entity_type: "institution",
    target_entity_id: 1,
    target_action_type: actionType,
    target_payload: payload,
    target_metadata: null,
  });
  if (error) {
    throw new Error(`収納機関の Undo 記録に失敗しました: ${error.message}`);
  }
};

export async function GET() {
  const { data, error } = await supabase.from("institution_info").select("*").eq("id", 1).maybeSingle();
  if (error) {
    return internalError("収納機関情報の取得に失敗しました", error.message);
  }
  return Response.json(normalizeInstitution(data));
}

export async function POST(request: Request) {
  let payload;
  try {
    payload = validatePayload(await request.json());
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "入力値が不正です");
  }

  return withServiceSupabase(async (client) => {
    try {
      const { data: before, error: fetchError } = await client
        .from("institution_info")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (fetchError) {
        return internalError("収納機関情報の取得に失敗しました", fetchError.message);
      }

      const { data, error } = await client
        .from("institution_info")
        .upsert({
          id: 1,
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("収納機関情報の更新に失敗しました", error.message);
      }

      await pushInstitutionUndo(client, "institution_update", { before });

      return Response.json({ institution: normalizeInstitution(data) });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("収納機関情報の更新に失敗しました", message);
    }
  });
}

