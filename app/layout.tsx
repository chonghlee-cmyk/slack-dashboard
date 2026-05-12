import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "작품 대시보드",
  description: "작품 관리 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-[#f4f5f7]">{children}</body>
    </html>
  );
}
