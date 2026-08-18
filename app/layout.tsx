import type { Metadata } from "next";
import { Anton } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// 웹폰트는 전부 셀프호스트 — 행사장 네트워크가 불안해도 스크린 타이포가 유지돼야 한다.
// next/font 는 빌드 시점에 폰트를 받아 같은 오리진에서 서빙하므로 런타임 CDN 의존이 없다.
//
// 본문은 Pretendard (한글 UI 가독성·숫자 정렬), 디스플레이는 Anton (영문 워드마크 전용).
// SUIT 는 사용 중단 — 파일은 남겨두되 로드하지 않는다 (되돌릴 일 대비).
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
});

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ANIMAL LEAGUE",
  description: "2026 LIKELION UNIV. 14th Hackathon 본선 토너먼트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${anton.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
