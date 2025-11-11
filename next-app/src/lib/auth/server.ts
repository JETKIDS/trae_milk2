import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import {
  createRouteHandlerClient,
  createServerComponentClient,
  type SupabaseClient,
} from "@supabase/auth-helpers-nextjs";

type EnsureAdminResult = {
  session: Session;
  profile: {
    role: string;
  };
};

const fetchProfile = async (client: SupabaseClient, userId: string) => {
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`プロファイルの取得に失敗しました: ${error.message}`);
  }

  return data;
};

export const getServerSession = async () => {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`セッションの取得に失敗しました: ${error.message}`);
  }

  return { supabase, session };
};

export const ensureAdmin = async (): Promise<EnsureAdminResult> => {
  const { supabase, session } = await getServerSession();

  if (!session) {
    throw new Error("ログインが必要です。");
  }

  const profile = await fetchProfile(supabase, session.user.id);

  if (!profile || profile.role !== "admin") {
    throw new Error("この操作を行う権限がありません。");
  }

  return { session, profile };
};

export const getRouteHandlerSupabase = (request: Request) =>
  createRouteHandlerClient({ cookies, request, response: NextResponse.next() });

