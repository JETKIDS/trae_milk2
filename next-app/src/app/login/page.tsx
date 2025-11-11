import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { getServerSession } from "@/lib/auth/server";

type PageProps = {
  searchParams?: {
    redirectTo?: string;
  };
};

export default async function LoginPage({ searchParams }: PageProps) {
  let sessionEmail: string | null = null;

  try {
    const { session } = await getServerSession();
    sessionEmail = session?.user?.email ?? null;
  } catch {
    sessionEmail = null;
  }

  const redirectTo = searchParams?.redirectTo ?? "/masters";

  if (sessionEmail) {
    redirect(redirectTo);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>管理者ログイン</h1>
        <p className="login-description">
          登録済みのメールアドレスを入力するとログイン用の確認リンクを送信します。
        </p>
        <LoginForm redirectTo={redirectTo} />
      </section>
    </main>
  );
}

