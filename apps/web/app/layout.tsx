import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });
const jetMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "BookOST — 글을 보여주면 음악이 나옵니다",
  description: "장면 텍스트나 스크린샷만 올리면, 그에 맞는 독서용 OST를 들을 수 있습니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${inter.variable} ${jetMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
