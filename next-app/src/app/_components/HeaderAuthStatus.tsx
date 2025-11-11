import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";
import { getServerSession } from "@/lib/auth/server";

type Props = {
  fallbackRedirect?: string;
};

export default async function HeaderAuthStatus({ fallbackRedirect = "/" }: Props) {
  let sessionEmail: string | null = null;

  try {
    const { session } = await getServerSession();
    sessionEmail = session?.user?.email ?? null;
  } catch {
    sessionEmail = null;
  }

  if (!sessionEmail) {
    return (
      <div className="app-header__auth">
        <Link href="/login">ログイン</Link>
      </div>
    );
  }

  return (
    <div className="app-header__auth">
      <span>{sessionEmail}</span>
      <form action={signOutAction}>
        <input type="hidden" name="redirectTo" value={fallbackRedirect} />
        <button type="submit">ログアウト</button>
      </form>
    </div>
  );
}

