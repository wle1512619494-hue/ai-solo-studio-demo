import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI Solo Studio | 空压机售后助手", description: "空压机 AI 售后助手演示系统" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
