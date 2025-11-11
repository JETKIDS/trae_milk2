"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Props = {
  redirectTo: string;
};

export default function LoginForm({ redirectTo }: Props) {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("メールアドレスを入力してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}${redirectTo.startsWith("/") ? redirectTo : "/masters"}`
              : redirectTo,
        },
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setStatusMessage("確認用メールを送信しました。受信トレイをご確認ください。");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ログイン処理でエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="login-form__field">
        <span>メールアドレス</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="example@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <button className="login-form__submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "送信中..." : "ログインリンクを送信"}
      </button>
      {statusMessage && <p className="login-form__message login-form__message--success">{statusMessage}</p>}
      {errorMessage && <p className="login-form__message login-form__message--error">{errorMessage}</p>}
    </form>
  );
}

