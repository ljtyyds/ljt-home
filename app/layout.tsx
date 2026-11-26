import type { Metadata } from "next";
import "./globals.css";
import "./appearance.css";
import { pageScaleInitScript } from "@/shared/pageScale";
import {appearanceInitScript} from "@/shared/appearance";
export const metadata:Metadata={title:"个人知识门户",description:"收藏值得关注的网站与资讯，安放想法，让每一次探索都有处可寻。",robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:pageScaleInitScript+appearanceInitScript}}/></head><body>{children}</body></html>;}
