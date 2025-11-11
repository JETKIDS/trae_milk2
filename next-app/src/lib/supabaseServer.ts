import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません。");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません。");
}

export const createServiceSupabaseClient = () =>
  createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "milk-delivery-next-app-server",
      },
    },
  });

export const withServiceSupabase = async <T>(
  callback: (client: ReturnType<typeof createServiceSupabaseClient>) => Promise<T>,
) => {
  const client = createServiceSupabaseClient();
  return callback(client);
};

