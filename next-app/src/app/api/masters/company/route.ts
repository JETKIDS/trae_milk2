import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/responses";
import { supabase } from "@/lib/supabaseClient";
import { withServiceSupabase } from "@/lib/supabaseServer";

const DEFAULT_COMPANY_INFO = {
  id: 1,
  company_name: "",
  company_name_kana_half: "",
  postal_code: "",
  address: "",
  phone: "",
  fax: "",
  email: "",
  representative: "",
  business_hours: "",
  established_date: "",
  capital: "",
  business_description: "",
};

const normalizeCompany = (row: Record<string, unknown> | null) => {
  if (!row) return DEFAULT_COMPANY_INFO;
  return {
    ...DEFAULT_COMPANY_INFO,
    ...row,
  };
};

const validatePayload = (body: Record<string, unknown>) => {
  if (!body || typeof body !== "object") {
    throw new Error("入力値が不正です");
  }
  if (!body.company_name || typeof body.company_name !== "string") {
    throw new Error("company_name は必須です");
  }

  const halfKanaRegex = /^[\uFF65-\uFF9F\u0020]+$/;
  if (body.company_name_kana_half !== undefined && body.company_name_kana_half !== null) {
    const value = String(body.company_name_kana_half).slice(0, 30);
    if (value.length > 0 && !halfKanaRegex.test(value)) {
      throw new Error("company_name_kana_half は半角カタカナで入力してください（スペース可）");
    }
    body.company_name_kana_half = value;
  }

  return {
    company_name: body.company_name,
    company_name_kana_half:
      body.company_name_kana_half === undefined || body.company_name_kana_half === null
        ? null
        : String(body.company_name_kana_half),
    postal_code: typeof body.postal_code === "string" ? body.postal_code : null,
    address: typeof body.address === "string" ? body.address : null,
    phone: typeof body.phone === "string" ? body.phone : null,
    fax: typeof body.fax === "string" ? body.fax : null,
    email: typeof body.email === "string" ? body.email : null,
    representative: typeof body.representative === "string" ? body.representative : null,
    business_hours: typeof body.business_hours === "string" ? body.business_hours : null,
    established_date: typeof body.established_date === "string" ? body.established_date : null,
    capital: typeof body.capital === "string" ? body.capital : null,
    business_description: typeof body.business_description === "string" ? body.business_description : null,
  };
};

const pushCompanyUndo = async (
  client: SupabaseClient,
  actionType: string,
  payload: Record<string, unknown>,
) => {
  const { error } = await client.rpc("rpc_push_master_undo", {
    target_entity_type: "company",
    target_entity_id: 1,
    target_action_type: actionType,
    target_payload: payload,
    target_metadata: null,
  });
  if (error) {
    throw new Error(`会社情報の Undo 記録に失敗しました: ${error.message}`);
  }
};

export async function GET() {
  const { data, error } = await supabase.from("company_info").select("*").eq("id", 1).maybeSingle();
  if (error) {
    return internalError("会社情報の取得に失敗しました", error.message);
  }
  return Response.json(normalizeCompany(data));
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
      const { data: before, error: fetchError } = await client.from("company_info").select("*").eq("id", 1).maybeSingle();
      if (fetchError) {
        return internalError("会社情報の取得に失敗しました", fetchError.message);
      }

      const { data, error } = await client
        .from("company_info")
        .upsert({
          id: 1,
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();

      if (error) {
        return internalError("会社情報の更新に失敗しました", error.message);
      }

      await pushCompanyUndo(client, "company_update", { before });

      return Response.json({ company: normalizeCompany(data) });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      return internalError("会社情報の更新に失敗しました", message);
    }
  });
}

