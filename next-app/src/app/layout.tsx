import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AdSlot } from "@/components/AdSlot";
import HeaderAuthStatus from "./_components/HeaderAuthStatus";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "牛乳配達顧客管理システム | Next.js プレビュー",
  description:
    "既存 React/Express 実装を Next.js + Supabase 構成へ移行するためのプレビュー環境です。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();

  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} app-body`}>
        <div className="app-shell">
          <header className="app-header">
            <div className="app-header__brand">
              <span className="app-header__title">牛乳配達顧客管理システム</span>
              <span className="app-header__subtitle">Next.js マイグレーション中</span>
            </div>
            <div className="app-header__controls">
              <HeaderAuthStatus fallbackRedirect="/" />
              <div className="app-header__ad">
                <AdSlot position="header" />
              </div>
            </div>
          </header>

          <div className="app-main">
            <main className="app-content">{children}</main>
            <aside className="app-sidebar" aria-label="広告枠">
              <AdSlot position="sidebar-primary" />
              <AdSlot position="sidebar-secondary" variant="compact" />
            </aside>
          </div>

          <footer className="app-footer">
            <span>© {year} Milk Delivery Management Project</span>
            <AdSlot position="footer" variant="wide" />
          </footer>
        </div>
      </body>
    </html>
  );
}
