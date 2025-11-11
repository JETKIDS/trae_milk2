"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";

export async function signOutAction(formData: FormData) {
  const redirectTo = formData.get("redirectTo")?.toString() ?? "/";
  const supabase = createServerActionClient({ cookies });
  await supabase.auth.signOut();
  redirect(redirectTo);
}

