import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Blocks,
  ChartNoAxesCombined,
  CheckCircle2,
  Code2,
  FileText,
  Github,
  Home,
  Image,
  Layers3,
  Mail,
  Package,
  Pencil,
  Presentation,
  Scale,
  ScrollText,
  Share2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUiLanguage, setUiLanguage, type UiLanguage } from "@/lib/ui-language";
import { useUiLanguage } from "@/lib/use-ui-language";
import { portalCanvasItems, type PortalCanvasItem, type PortalWorkspace } from "./data";

type PortalPageProps = {
  onEnterWorkspace: (workspace: PortalWorkspace) => void;
};

type PortalSection = "home" | PortalWorkspace;

type DetailConfig = {
  title: string;
  subtitle: string;
  intro: string;
  tags: string[];
  bullets: string[];
  previews: Array<{ title: string; image: string }>;
  steps: Array<{ title: string; text: string; icon: typeof Blocks }>;
  cta: string;
  slogan: string;
};

type PreviewImage = { title: string; image: string };

const brushCursor = `url("/icons/brush-calligraphy.svg?v=2") 11 43, auto`;

const orbitRadius = 250;

function scrollToPortalSection(section: PortalSection) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent<PortalSection>("portal:navigate", { detail: section }));
}

function polarPosition(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
}

function OrbitNode({ angle, radius, delay }: { angle: number; radius: number; delay: number }) {
  const point = polarPosition(angle, radius);
  return (
    <g style={{ animation: `portal-node-pulse 3.2s ease-in-out ${delay}s infinite` }}>
      <circle cx={360 + point.x} cy={360 + point.y} r="17" fill="rgba(35,108,255,0.12)" />
      <circle cx={360 + point.x} cy={360 + point.y} r="8" fill="#236CFF" />
      <circle cx={360 + point.x} cy={360 + point.y} r="3" fill="#FFFFFF" />
    </g>
  );
}

function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center", className)}>
      <svg viewBox="0 0 48 48" role="img" aria-label="CanvasAnvil" className="h-full w-full drop-shadow-[0_8px_18px_rgba(35,108,255,0.22)]">
        <path d="M24 3.8 42 12.8 24 21.8 6 12.8 24 3.8Z" fill="#236CFF" />
        <path d="M24 8.6 32.4 12.8 24 17 15.6 12.8 24 8.6Z" fill="#8EC1FF" />
        <path d="M8.8 17.5 24 25.1l15.2-7.6v5.7L24 30.8 8.8 23.2v-5.7Z" fill="#0B77F4" />
        <path d="M16.5 29.3h15l-2.7 4.4h-9.6l-2.7-4.4Z" fill="#053EA8" />
        <path d="M18.8 33.1h10.4v5.1H18.8v-5.1Z" fill="#236CFF" />
        <path d="M13.2 38.1h21.6l3 5.4H10.2l3-5.4Z" fill="#0758D8" />
        <path d="M19.5 39.4h9" stroke="#A9D0FF" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const canvasIcons: Record<PortalWorkspace, typeof Blocks> = {
  flow: Blocks,
  cad: Home,
  ppt: Presentation,
  poster: ScrollText,
  infographic: ChartNoAxesCombined,
  product: Package,
};

const detailConfigs: Record<PortalWorkspace, DetailConfig> = {
  flow: {
    title: "\u6d41\u7a0b\u753b\u5e03",
    subtitle: "\u4e00\u53e5\u9700\u6c42\uff0c\u5feb\u901f\u751f\u6210\u7ed3\u6784\u5316\u6d41\u7a0b\u56fe",
    intro: "\u6d41\u7a0b\u753b\u5e03\u8ba9\u4f60\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u6d41\u7a0b\uff0c\u81ea\u52a8\u751f\u6210\u53ef\u7f16\u8f91\u7684\u6d41\u7a0b\u56fe\u3002\u652f\u6301\u8282\u70b9\u4e0e\u8fde\u7ebf\u7f16\u8f91\u3001\u5c40\u90e8\u4fee\u6539\uff0c\u5e76\u53ef\u5bfc\u51fa draw.io XML\u3002",
    tags: ["\u7ed3\u6784\u5316\u751f\u6210", "\u5c40\u90e8\u4fee\u6539", "draw.io XML"],
    bullets: ["\u667a\u80fd\u89e3\u6790\u9700\u6c42\uff0c\u81ea\u52a8\u62bd\u53d6\u6d41\u7a0b\u8282\u70b9\u4e0e\u5173\u7cfb", "\u652f\u6301\u8282\u70b9\u4e0e\u8fde\u7ebf\u7f16\u8f91\uff0c\u62d6\u62fd\u5373\u6539", "\u5c40\u90e8\u4fee\u6539\uff0c\u5feb\u901f\u5fae\u8c03\u590d\u6742\u6d41\u7a0b", "\u5bfc\u51fa draw.io XML\uff0c\u4fbf\u4e8e\u590d\u7528\u4e0e\u534f\u4f5c"],
    previews: [
      { title: "\u5b66\u672f\u7814\u7a76\u6846\u67b6\u56fe", image: "/examples/readme-previews/flow/01.png" },
      { title: "\u667a\u80fd\u95ee\u7b54\u7cfb\u7edf\u67b6\u6784", image: "/examples/readme-previews/flow/02.png" },
      { title: "\u9879\u76ee\u5b9e\u65bd\u8def\u7ebf\u56fe", image: "/examples/readme-previews/flow/03.png" },
      { title: "\u8bfe\u7a0b\u8bbe\u8ba1\u601d\u7ef4\u5bfc\u56fe", image: "/examples/readme-previews/flow/04.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u9700\u6c42", text: "\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u6d41\u7a0b\u76ee\u6807\u4e0e\u7ea6\u675f\u3002", icon: FileText },
      { title: "\u7ed3\u6784\u5316\u89e3\u6790", text: "AI \u62bd\u53d6\u8282\u70b9\u3001\u5173\u7cfb\u4e0e\u65b9\u5411\u3002", icon: Share2 },
      { title: "\u751f\u6210 XML", text: "\u8f6c\u6362\u4e3a draw.io \u517c\u5bb9\u7684\u6d41\u7a0b\u56fe\u6570\u636e\u3002", icon: Code2 },
      { title: "\u9884\u89c8\u4e0e\u6821\u9a8c", text: "\u68c0\u67e5\u8282\u70b9\u4e0e\u8fde\u7ebf\u662f\u5426\u7b26\u5408\u9884\u671f\u3002", icon: ChartNoAxesCombined },
      { title: "\u5c40\u90e8\u4fee\u6539", text: "\u5bf9\u8282\u70b9\u6216\u8fde\u7ebf\u8fdb\u884c\u7cbe\u7ec6\u8c03\u6574\u3002", icon: Pencil },
      { title: "\u5bfc\u51fa\u590d\u7528", text: "\u5bfc\u51fa draw.io XML\uff0c\u7528\u4e8e\u534f\u4f5c\u4e0e\u590d\u7528\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u6d41\u7a0b\u56fe\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u521b\u4f5c",
  },
  cad: {
    title: "\u5ba4\u5185\u8bbe\u8ba1\u753b\u5e03",
    subtitle: "\u4ece\u7a7a\u95f4\u9700\u6c42\u5230\u6210\u5957\u56fe\u7eb8\u4e0e\u6e32\u67d3",
    intro: "\u5ba4\u5185\u8bbe\u8ba1\u753b\u5e03\u5c06\u7a7a\u95f4\u9700\u6c42\u8f6c\u5316\u4e3a\u5b8c\u6574\u7684\u8bbe\u8ba1\u65b9\u6848\uff0c\u81ea\u52a8\u751f\u6210\u5e73\u9762\u5e03\u5c40\u3001\u7acb\u9762\u4e0e\u8be6\u56fe\uff0c\u8f93\u51fa\u6e32\u67d3\u53ca\u6750\u6599\u6e05\u5355\u3002",
    tags: ["\u7a7a\u95f4\u89c4\u5212", "2D SVG", "\u6e32\u67d3 / \u6750\u6599\u6e05\u5355"],
    bullets: ["\u6237\u578b\u89e3\u6790\u4e0e\u529f\u80fd\u5206\u533a\uff0c\u5feb\u901f\u786e\u5b9a\u7a7a\u95f4\u5e03\u5c40", "\u591a\u56fe\u7eb8\u8054\u52a8\u751f\u6210\uff0c\u5e73\u9762\u3001\u7acb\u9762\u3001\u8be6\u56fe\u4e00\u4f53\u5316", "\u6548\u679c\u56fe\u4e0e\u6750\u6599\u53c2\u8003\uff0c\u5448\u73b0\u771f\u5b9e\u7a7a\u95f4\u6548\u679c", "\u6750\u6599\u6e05\u5355\u4e0e\u56fe\u7eb8\u5bfc\u51fa\uff0c\u652f\u6301\u65bd\u5de5\u4ea4\u4ed8"],
    previews: [
      { title: "\u88c5\u4fee\u5e73\u9762\u5e03\u7f6e\u56fe", image: "/examples/cad/01.png" },
      { title: "\u5730\u9762\u94fa\u88c5\u56fe", image: "/examples/cad/02.png" },
      { title: "\u9876\u9762\u5e03\u7f6e\u56fe", image: "/examples/cad/03.png" },
      { title: "\u8282\u70b9\u8be6\u56fe", image: "/examples/cad/07.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u7a7a\u95f4\u9700\u6c42", text: "\u8f93\u5165\u6237\u578b\u4fe1\u606f\u4e0e\u9700\u6c42\u6e05\u5355\u3002", icon: FileText },
      { title: "\u7a7a\u95f4\u5206\u6790", text: "\u5206\u6790\u529f\u80fd\u5206\u533a\u4e0e\u52a8\u7ebf\u3002", icon: Package },
      { title: "\u751f\u6210\u5e73\u9762", text: "\u751f\u6210\u5e73\u9762\u5e03\u7f6e\u4e0e\u5c3a\u5bf8\u6807\u6ce8\u3002", icon: Home },
      { title: "\u8054\u52a8\u56fe\u7eb8", text: "\u8054\u52a8\u7acb\u9762\u3001\u5929\u82b1\u548c\u8282\u70b9\u56fe\u3002", icon: Layers3 },
      { title: "\u6e32\u67d3\u6821\u9a8c", text: "\u751f\u6210\u6548\u679c\u56fe\u5e76\u6821\u9a8c\u6750\u8d28\u3002", icon: Image },
      { title: "\u5bfc\u51fa\u56fe\u7eb8", text: "\u5bfc\u51fa CAD/PDF/SVG \u4e0e\u6750\u6599\u6e05\u5355\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u5ba4\u5185\u8bbe\u8ba1\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u521b\u4f5c",
  },
  ppt: {
    title: "PPT\u753b\u5e03",
    subtitle: "\u4ece\u4e3b\u9898\u5230\u6f14\u793a\u6587\u7a3f\uff0c\u6309\u9875\u9762\u6301\u7eed\u8fed\u4ee3",
    intro: "PPT\u753b\u5e03\u5c06\u4e3b\u9898\u7ed3\u6784\u5316\u4e3a\u53ef\u6f14\u793a\u7684\u903b\u8f91\u5185\u5bb9\uff0c\u81ea\u52a8\u751f\u6210\u6f14\u793a\u6587\u7a3f\u5927\u7eb2\u5e76\u62c6\u5206\u9875\u9762\u7c7b\u578b\uff0c\u652f\u6301\u9875\u9762\u751f\u6210\u4e0e\u5c40\u90e8\u8fed\u4ee3\u3002",
    tags: ["\u7ed3\u6784\u5316\u751f\u6210", "\u9875\u9762\u7ea7\u7f16\u8f91", "\u6a21\u677f\u5bf9\u9f50"],
    bullets: ["\u4e3b\u9898\u8f6c\u5927\u7eb2\uff0c\u6784\u5efa\u6e05\u6670\u7684\u6f14\u793a\u903b\u8f91", "\u81ea\u52a8\u62c6\u5206\u9875\u9762\u7c7b\u578b\uff0c\u5339\u914d\u6700\u4f73\u8868\u8fbe\u65b9\u5f0f", "\u652f\u6301\u5c40\u90e8\u7eed\u5199\u4e0e\u6539\u5199\uff0c\u7cbe\u7ec6\u8c03\u6574\u6bcf\u4e00\u9875", "\u5bfc\u51fa\u53ef\u7f16\u8f91\u6f14\u793a\u7a3f\uff0c\u81ea\u7531\u8c03\u6574\u4e0e\u590d\u7528"],
    previews: [
      { title: "AI\u5185\u5bb9\u521b\u4f5c\u6d41\u7a0b", image: "/examples/readme-previews/ppt/ppt1.png" },
      { title: "\u667a\u80fd\u534f\u4f5c\u589e\u957f", image: "/examples/readme-previews/ppt/ppt2.png" },
      { title: "\u5546\u4e1a\u521b\u65b0\u6f14\u793a", image: "/examples/readme-previews/ppt/ppt3.png" },
      { title: "\u4f4e\u78b3\u6821\u56ed\u8f6c\u578b", image: "/examples/readme-previews/ppt/ppt4.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u4e3b\u9898", text: "\u8f93\u5165\u6f14\u793a\u4e3b\u9898\u4e0e\u76ee\u6807\u53d7\u4f17\u3002", icon: FileText },
      { title: "\u751f\u6210\u5927\u7eb2", text: "\u57fa\u4e8e\u4e3b\u9898\u751f\u6210\u7ae0\u8282\u4e0e\u903b\u8f91\u7ed3\u6784\u3002", icon: Share2 },
      { title: "\u62c6\u5206\u9875\u9762", text: "\u81ea\u52a8\u8bc6\u522b\u5c01\u9762\u3001\u76ee\u5f55\u3001\u56fe\u8868\u3001\u7ed3\u8bba\u7b49\u7ed3\u6784\u3002", icon: Blocks },
      { title: "\u9875\u9762\u751f\u6210", text: "\u6309\u5927\u7eb2\u548c\u9875\u9762\u7c7b\u578b\u751f\u6210\u5185\u5bb9\u3002", icon: Presentation },
      { title: "\u5c40\u90e8\u8fed\u4ee3", text: "\u652f\u6301\u9875\u9762\u7eed\u5199\u3001\u6539\u5199\u4e0e\u8c03\u6574\u3002", icon: Pencil },
      { title: "\u5bfc\u51fa PPT", text: "\u5bfc\u51fa\u53ef\u7f16\u8f91\u7684 PPT \u683c\u5f0f\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u6f14\u793a\u521b\u4f5c\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u6d41\u7545",
  },
  poster: {
    title: "\u6d77\u62a5\u753b\u5e03",
    subtitle: "\u591a\u98ce\u683c\u4e3b\u89c6\u89c9\u4e0e\u6587\u6848\u6392\u7248\uff0c\u4e00\u9875\u5b8c\u6210",
    intro: "\u6d77\u62a5\u753b\u5e03\u4e3a\u54c1\u724c\u5ba3\u4f20\u3001\u6d3b\u52a8\u8425\u9500\u4e0e\u5c55\u89c8\u6f14\u51fa\u63d0\u4f9b\u4e3b\u89c6\u89c9\u4e0e\u6587\u6848\u6392\u7248\u80fd\u529b\uff0c\u652f\u6301\u591a\u79cd\u98ce\u683c\u4e0e\u5c3a\u5bf8\u3002",
    tags: ["\u98ce\u683c\u9a71\u52a8", "\u4e3b\u89c6\u89c9\u751f\u6210", "\u6587\u6848\u6392\u7248"],
    bullets: ["\u652f\u6301\u6a2a\u7248/\u7ad6\u7248\u5c3a\u5bf8\uff0c\u9002\u914d\u591a\u79cd\u5e73\u53f0\u4e0e\u5370\u5237\u9700\u6c42", "\u591a\u98ce\u683c\u5feb\u901f\u5207\u6362\uff0c\u6ee1\u8db3\u4e0d\u540c\u6d3b\u52a8\u4e0e\u54c1\u724c\u8c03\u6027", "\u6d77\u62a5\u6587\u6848\u81ea\u52a8\u7f16\u6392\uff0c\u5c42\u7ea7\u6e05\u6670", "\u652f\u6301\u5c40\u90e8\u66ff\u6362\u4e0e\u5fae\u8c03\uff0c\u4f18\u5316\u6bcf\u4e00\u5904\u7ec6\u8282"],
    previews: [
      { title: "\u9752\u5e74\u8bbe\u8ba1\u8bba\u575b", image: "/examples/poster/01.png" },
      { title: "\u6c5f\u5357\u56fd\u6f6e\u6587\u5316\u8282", image: "/examples/poster/02.png" },
      { title: "\u57ce\u5e02\u590f\u65e5\u97f3\u4e50\u8282", image: "/examples/poster/03.png" },
      { title: "\u672a\u6765\u667a\u80fd\u79d1\u6280\u5cf0\u4f1a", image: "/examples/poster/04.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u4e3b\u9898", text: "\u8f93\u5165\u6d3b\u52a8\u3001\u4ea7\u54c1\u6216\u54c1\u724c\u4e3b\u9898\u3002", icon: FileText },
      { title: "\u8bbe\u5b9a\u98ce\u683c", text: "\u9009\u62e9\u8272\u8c03\u3001\u7248\u5f0f\u4e0e\u98ce\u683c\u504f\u597d\u3002", icon: Wand2 },
      { title: "\u751f\u6210\u4e3b\u89c6\u89c9", text: "\u751f\u6210\u56fe\u50cf\u3001\u914d\u8272\u548c\u6838\u5fc3\u5143\u7d20\u3002", icon: Image },
      { title: "\u7f16\u6392\u6587\u6848", text: "\u81ea\u52a8\u7f16\u6392\u6807\u9898\u3001\u6b63\u6587\u548c\u4fe1\u606f\u3002", icon: FileText },
      { title: "\u5c40\u90e8\u5fae\u8c03", text: "\u8c03\u6574\u56fe\u7247\u3001\u5b57\u4f53\u3001\u8272\u5f69\u548c\u7ec6\u8282\u3002", icon: Pencil },
      { title: "\u5bfc\u51fa\u6d77\u62a5", text: "\u5bfc\u51fa\u6e05\u6670\u6d77\u62a5\uff0c\u652f\u6301\u591a\u79cd\u5c3a\u5bf8\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u6d77\u62a5\u521b\u610f\u66f4\u5feb\u843d\u5730",
  },
  infographic: {
    title: "\u4fe1\u606f\u56fe\u753b\u5e03",
    subtitle: "\u628a\u4fe1\u606f\u7ed3\u6784\u5316\uff0c\u518d\u53d8\u6210\u6e05\u6670\u597d\u770b\u7684\u53ef\u89c6\u5316\u9875\u9762",
    intro: "\u4fe1\u606f\u56fe\u753b\u5e03\u5c06\u6570\u636e\u3001\u89c2\u70b9\u6216\u4e3b\u9898\u5185\u5bb9\u5feb\u901f\u8f6c\u5316\u4e3a\u4e00\u9875\u5f0f\u4fe1\u606f\u56fe\uff0c\u81ea\u52a8\u62c6\u89e3\u4fe1\u606f\u3001\u5339\u914d\u56fe\u8868\u4e0e\u7248\u5f0f\u3002",
    tags: ["\u4fe1\u606f\u62c6\u89e3", "\u56fe\u8868\u7ec4\u5408", "\u7248\u5f0f\u751f\u6210"],
    bullets: ["\u4e3b\u9898\u4e0e\u6570\u636e\u8f93\u5165\uff0c\u652f\u6301\u6587\u5b57\u3001\u8868\u683c\u7b49\u6765\u6e90", "\u81ea\u52a8\u56fe\u8868\u4e0e\u6a21\u5757\u7ec4\u5408\uff0c\u9009\u62e9\u5408\u9002\u8868\u8fbe\u65b9\u5f0f", "\u4e00\u9875\u5f0f\u4fe1\u606f\u8868\u8fbe\uff0c\u8ba9\u590d\u6742\u4fe1\u606f\u4e00\u76ee\u4e86\u7136", "\u652f\u6301\u5c40\u90e8\u6539\u5199\u4e0e\u8c03\u6574\uff0c\u7075\u6d3b\u4f18\u5316\u5185\u5bb9\u4e0e\u6837\u5f0f"],
    previews: [
      { title: "AI\u7b97\u529b\u589e\u957f\u8d8b\u52bf", image: "/examples/infographic/01.png" },
      { title: "\u667a\u80fd\u6c7d\u8f66\u7528\u6237\u5173\u6ce8\u70b9", image: "/examples/infographic/02.png" },
      { title: "\u5065\u5eb7\u751f\u6d3b\u6307\u5357", image: "/examples/infographic/03.png" },
      { title: "\u4f4e\u78b3\u751f\u6d3b", image: "/examples/infographic/04.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u4e3b\u9898/\u6570\u636e", text: "\u8f93\u5165\u4e3b\u9898\u3001\u8981\u70b9\u6216\u6570\u636e\u6765\u6e90\u3002", icon: FileText },
      { title: "\u4fe1\u606f\u62c6\u89e3", text: "\u62c6\u89e3\u5173\u952e\u4fe1\u606f\u4e0e\u5173\u7cfb\u7ed3\u6784\u3002", icon: Share2 },
      { title: "\u9009\u62e9\u56fe\u8868", text: "\u63a8\u8350\u9002\u5408\u7684\u56fe\u8868\u4e0e\u53ef\u89c6\u5316\u6a21\u5757\u3002", icon: ChartNoAxesCombined },
      { title: "\u4fe1\u606f\u6392\u7248", text: "\u7ec4\u5408\u6a21\u5757\u5e76\u751f\u6210\u7248\u5f0f\u3002", icon: Blocks },
      { title: "\u89c6\u89c9\u6da6\u8272", text: "\u7edf\u4e00\u914d\u8272\u3001\u5b57\u4f53\u548c\u56fe\u6807\u3002", icon: Wand2 },
      { title: "\u5bfc\u51fa\u4fe1\u606f\u56fe", text: "\u5bfc\u51fa PNG\u3001PDF\u3001SVG \u7b49\u683c\u5f0f\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u4fe1\u606f\u53ef\u89c6\u5316\uff0c\u51b3\u7b56\u66f4\u9ad8\u6548",
  },
  product: {
    title: "\u4ea7\u54c1\u4ecb\u7ecd\u753b\u5e03",
    subtitle: "\u7a81\u51fa\u5356\u70b9\u3001\u53c2\u6570\u4e0e\u4e3b\u89c6\u89c9\uff0c\u5feb\u901f\u505a\u51fa\u4ea7\u54c1\u5c55\u793a\u9875",
    intro: "\u4ea7\u54c1\u4ecb\u7ecd\u753b\u5e03\u5e2e\u52a9\u4f60\u5feb\u901f\u751f\u6210\u4ea7\u54c1\u4ecb\u7ecd\u56fe\u6216\u4ea7\u54c1\u8bf4\u660e\u9875\uff0c\u805a\u7126\u6838\u5fc3\u5356\u70b9\u3001\u4e3b\u89c6\u89c9\u548c\u53c2\u6570\u4fe1\u606f\u3002",
    tags: ["\u5356\u70b9\u63d0\u70bc", "\u4e3b\u89c6\u89c9\u751f\u6210", "\u53c2\u6570\u5e03\u5c40"],
    bullets: ["\u8f93\u5165\u4ea7\u54c1\u56fe\u4e0e\u63cf\u8ff0\uff0c\u81ea\u52a8\u6574\u7406\u6838\u5fc3\u5356\u70b9", "\u751f\u6210\u9ad8\u8d28\u91cf\u4e3b\u89c6\u89c9\uff0c\u7a81\u51fa\u4ea7\u54c1\u8d28\u611f", "\u652f\u6301\u53c2\u6570/\u4eae\u70b9\u6a21\u5757\u7f16\u6392", "\u9002\u5408\u5c55\u793a\u56fe\u4e0e\u4ea7\u54c1\u8bf4\u660e\u9875"],
    previews: [
      { title: "\u65e0\u7ebf\u964d\u566a\u8033\u673a", image: "/examples/product/01.png" },
      { title: "\u65d7\u8230\u6e38\u620f\u672c", image: "/examples/product/02.png" },
      { title: "\u4eae\u80a4\u7cbe\u534e", image: "/examples/product/03.png" },
      { title: "\u667a\u80fd\u7535\u52a8 SUV", image: "/examples/product/04.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u4ea7\u54c1\u4fe1\u606f", text: "\u4e0a\u4f20\u4ea7\u54c1\u56fe\u5e76\u586b\u5199\u540d\u79f0\u3001\u529f\u80fd\u548c\u53c2\u6570\u3002", icon: FileText },
      { title: "\u63d0\u70bc\u5356\u70b9", text: "\u5206\u6790\u4ea7\u54c1\u4fe1\u606f\uff0c\u63d0\u70bc\u6838\u5fc3\u5356\u70b9\u3002", icon: Wand2 },
      { title: "\u751f\u6210\u4e3b\u89c6\u89c9", text: "\u6839\u636e\u4ea7\u54c1\u7279\u5f81\u751f\u6210\u9ad8\u8d28\u91cf\u4e3b\u89c9\u3002", icon: Image },
      { title: "\u5e03\u5c40\u53c2\u6570\u6a21\u5757", text: "\u667a\u80fd\u7f16\u6392\u53c2\u6570\u4e0e\u4eae\u70b9\u6a21\u5757\u3002", icon: Blocks },
      { title: "\u5c40\u90e8\u4f18\u5316", text: "\u5bf9\u6587\u6848\u3001\u914d\u8272\u548c\u6392\u7248\u505a\u7ec6\u8282\u8c03\u6574\u3002", icon: Pencil },
      { title: "\u5bfc\u51fa\u4ecb\u7ecd\u56fe", text: "\u5bfc\u51fa\u6e05\u6670\u4ea7\u54c1\u4ecb\u7ecd\u56fe\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u4ea7\u54c1\u4ecb\u7ecd\u66f4\u6e05\u6670\u3001\u66f4\u6709\u5438\u5f15\u529b",
  },
};

const detailConfigsEn: Record<PortalWorkspace, DetailConfig> = {
  flow: {
    title: "Flow Canvas",
    subtitle: "Turn a short requirement into a structured flowchart",
    intro: "Flow Canvas converts natural-language process descriptions into editable diagrams. It supports node and connector edits, local revisions, and draw.io XML export.",
    tags: ["Structured diagrams", "Local edits", "draw.io XML"],
    bullets: ["Parse requirements into nodes and relationships", "Edit nodes and connectors directly", "Revise selected parts without regenerating the whole diagram", "Export draw.io XML for collaboration and reuse"],
    previews: detailConfigs.flow.previews,
    steps: [
      { title: "Describe", text: "Enter goals, process details, and constraints.", icon: FileText },
      { title: "Analyze", text: "AI extracts nodes, relationships, and directions.", icon: Share2 },
      { title: "Generate XML", text: "Convert the structure into draw.io-compatible data.", icon: Code2 },
      { title: "Review", text: "Check whether nodes and links match your intent.", icon: ChartNoAxesCombined },
      { title: "Revise", text: "Fine-tune selected nodes or connectors.", icon: Pencil },
      { title: "Export", text: "Export XML for reuse and collaboration.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Create flowcharts with the freedom of a canvas",
  },
  cad: {
    title: "Interior Design Canvas",
    subtitle: "From spatial requirements to drawings, renders, and material lists",
    intro: "Interior Design Canvas turns room requirements into design packages, including layouts, elevations, details, render references, and material lists.",
    tags: ["Space planning", "2D SVG", "Renders / Materials"],
    bullets: ["Analyze floor plans and functional zones", "Generate linked plan, elevation, ceiling, and detail drawings", "Use render references and material cues to present the space", "Export drawings and material lists for delivery"],
    previews: detailConfigs.cad.previews,
    steps: [
      { title: "Input Brief", text: "Provide room information and design needs.", icon: FileText },
      { title: "Plan Space", text: "Analyze zoning and circulation.", icon: Package },
      { title: "Create Plan", text: "Generate layout drawings and dimensions.", icon: Home },
      { title: "Link Drawings", text: "Connect elevations, ceilings, and details.", icon: Layers3 },
      { title: "Render Check", text: "Generate render references and review materials.", icon: Image },
      { title: "Export", text: "Export drawings and material lists.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Make interior design feel as fluid as a canvas",
  },
  ppt: {
    title: "PPT Canvas",
    subtitle: "From topic to deck, with page-level iteration",
    intro: "PPT Canvas structures your topic into a presentation outline, splits it into slide types, and supports slide generation, review, and local revision.",
    tags: ["Outline first", "Slide editing", "Template aligned"],
    bullets: ["Turn a topic into a clear deck outline", "Split content into cover, agenda, chart, and conclusion slides", "Revise or extend individual slides", "Export editable presentation files"],
    previews: detailConfigs.ppt.previews,
    steps: [
      { title: "Input Topic", text: "Enter the topic and target audience.", icon: FileText },
      { title: "Build Outline", text: "Generate chapters and narrative structure.", icon: Share2 },
      { title: "Split Slides", text: "Identify cover, agenda, chart, and summary pages.", icon: Blocks },
      { title: "Generate", text: "Create slides from the outline and page types.", icon: Presentation },
      { title: "Iterate", text: "Rewrite, extend, or adjust selected pages.", icon: Pencil },
      { title: "Export PPT", text: "Export an editable PPT file.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Make presentation creation smooth and visual",
  },
  poster: {
    title: "Poster Canvas",
    subtitle: "Campaign visuals and copy layout in one page",
    intro: "Poster Canvas creates key visuals and typographic layouts for brand campaigns, events, exhibitions, and social media assets across styles and sizes.",
    tags: ["Style driven", "Key visual", "Copy layout"],
    bullets: ["Support portrait and landscape sizes", "Switch styles for different brands and events", "Arrange poster copy with clear hierarchy", "Revise images, type, colors, and details locally"],
    previews: detailConfigs.poster.previews,
    steps: [
      { title: "Input Theme", text: "Enter the campaign, product, or brand topic.", icon: FileText },
      { title: "Set Style", text: "Choose color, layout, and visual direction.", icon: Wand2 },
      { title: "Create Visual", text: "Generate image, palette, and key elements.", icon: Image },
      { title: "Layout Copy", text: "Arrange title, body, and event information.", icon: FileText },
      { title: "Refine", text: "Tune images, fonts, colors, and details.", icon: Pencil },
      { title: "Export", text: "Export the finished poster.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Turn poster ideas into finished visuals faster",
  },
  infographic: {
    title: "Infographic Canvas",
    subtitle: "Structure information, then make it visual",
    intro: "Infographic Canvas transforms data, viewpoints, or topic notes into a one-page visual explanation with modules, charts, and clear hierarchy.",
    tags: ["Information structure", "Chart modules", "Generated layout"],
    bullets: ["Accept topic notes, text, and data sources", "Recommend suitable chart and module combinations", "Communicate complex information at a glance", "Revise content and visual style locally"],
    previews: detailConfigs.infographic.previews,
    steps: [
      { title: "Input Data", text: "Enter topic notes, key points, or data.", icon: FileText },
      { title: "Structure", text: "Break information into clear relationships.", icon: Share2 },
      { title: "Choose Charts", text: "Suggest charts and visual modules.", icon: ChartNoAxesCombined },
      { title: "Layout", text: "Assemble modules into a page.", icon: Blocks },
      { title: "Polish", text: "Unify color, typography, and icon style.", icon: Wand2 },
      { title: "Export", text: "Export PNG, PDF, SVG, or other formats.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Make information visual and decisions clearer",
  },
  product: {
    title: "Product Intro Canvas",
    subtitle: "Highlight selling points, specs, and key visuals",
    intro: "Product Intro Canvas helps create product introduction images and product pages focused on core selling points, visuals, and specification modules.",
    tags: ["Selling points", "Key visual", "Spec layout"],
    bullets: ["Input product images and descriptions", "Extract core selling points automatically", "Generate high-quality product visuals", "Arrange highlights and specification modules"],
    previews: detailConfigs.product.previews,
    steps: [
      { title: "Input Product", text: "Upload product images and enter details.", icon: FileText },
      { title: "Extract Points", text: "Analyze and summarize core value.", icon: Wand2 },
      { title: "Create Visual", text: "Generate a product-focused key visual.", icon: Image },
      { title: "Layout Specs", text: "Arrange parameters and highlight modules.", icon: Blocks },
      { title: "Refine", text: "Tune copy, color, and layout details.", icon: Pencil },
      { title: "Export", text: "Export the product introduction image.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Make product stories clearer and more compelling",
  },
};

function getDetailConfig(canvas: PortalWorkspace, uiLang: UiLanguage) {
  return uiLang === "zh" ? detailConfigs[canvas] : detailConfigsEn[canvas];
}

function OrbitCard({
  item,
  uiLang,
  active,
  paused,
  onActive,
  onClick,
}: {
  item: PortalCanvasItem;
  uiLang: UiLanguage;
  active: boolean;
  paused: boolean;
  onActive: () => void;
  onClick: () => void;
}) {
  const point = polarPosition(item.angle, orbitRadius);
  const Icon = canvasIcons[item.id];

  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          animation: "portal-card-counter 38s linear infinite",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        <motion.button
          whileHover={{ y: -5, scale: 1.02 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className={cn(
            "group w-[160px] overflow-hidden rounded-2xl border bg-white p-2.5 text-left shadow-[0_16px_36px_rgba(19,55,120,0.13)]",
            active ? "border-[#8CB3FF] shadow-[0_24px_54px_rgba(35,108,255,0.22)]" : "border-[#E7EEFB]",
          )}
          onMouseEnter={onActive}
          onFocus={onActive}
          onClick={onClick}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#EEF4FF] text-[#236CFF]">
                <Icon className="h-4 w-4" />
              </span>
              <div className="line-clamp-2 text-[13px] font-bold leading-4 text-slate-900">
                {uiLang === "zh" ? item.zhTitle : item.enTitle}
              </div>
            </div>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.accent }} />
          </div>
          <div className="overflow-hidden rounded-xl border border-[#EEF3FE] bg-[#F7FAFF]">
            <img
              src={item.image}
              alt={uiLang === "zh" ? item.zhTitle : item.enTitle}
              className="h-[96px] w-full object-cover object-top transition duration-500 group-hover:scale-[1.04]"
            />
          </div>
        </motion.button>
      </div>
    </div>
  );
}

function Header({
  uiLang,
  copy,
  activeCanvas,
  activeSection,
  setActiveSection,
  setActiveCanvas,
  setUiLang,
}: {
  uiLang: UiLanguage;
  copy: { home: string; openRepo: string };
  activeCanvas: PortalWorkspace;
  activeSection: PortalSection;
  setActiveSection: (section: PortalSection) => void;
  setActiveCanvas: (workspace: PortalWorkspace) => void;
  setUiLang: Dispatch<SetStateAction<UiLanguage>>;
}) {
  const isChinese = uiLang === "zh";

  return (
    <header className="rounded-2xl border border-white bg-white/94 px-4 py-2.5 shadow-[0_14px_38px_rgba(34,76,150,0.09)] backdrop-blur-xl lg:px-6">
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[220px_minmax(0,1fr)_132px] xl:items-center">
        <button
          className="flex items-center gap-4 text-left"
          onClick={() => {
            setActiveSection("home");
            setActiveCanvas("flow");
            scrollToPortalSection("home");
          }}
        >
          <BrandIcon className="h-10 w-10" />
          <span className="text-[22px] font-black text-slate-950">CanvasAnvil</span>
        </button>

        <nav className="overflow-x-auto">
          <div className="flex min-w-max items-center justify-center gap-3 2xl:gap-5">
            <button
              className={cn(
                "border-b-3 px-2 py-2 font-bold leading-tight transition",
                isChinese ? "text-[16px] 2xl:text-[17px]" : "text-[14px] 2xl:text-[15px]",
                activeSection === "home" ? "border-[#236CFF] text-[#236CFF]" : "border-transparent text-slate-800 hover:text-[#236CFF]",
              )}
              onClick={() => {
                setActiveSection("home");
                scrollToPortalSection("home");
              }}
            >
              {copy.home}
            </button>
            {portalCanvasItems.map((item) => (
              <button
                key={item.id}
                className={cn(
                  "whitespace-normal border-b-3 px-1 py-2 text-center font-bold leading-tight transition 2xl:max-w-none",
                  isChinese ? "max-w-[118px] text-[16px] 2xl:text-[17px]" : "max-w-[112px] text-[13px] 2xl:text-[15px]",
                  activeSection === item.id
                    ? "border-[#236CFF] text-[#236CFF]"
                    : "border-transparent text-slate-800 hover:text-[#236CFF]",
                )}
                onMouseEnter={() => setActiveCanvas(item.id)}
                onFocus={() => setActiveCanvas(item.id)}
                onClick={() => {
                  setActiveCanvas(item.id);
                  setActiveSection(item.id);
                  scrollToPortalSection(item.id);
                }}
              >
                {uiLang === "zh" ? item.zhTitle : item.enTitle}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-full border-[#D7E5FF] bg-white px-4 text-slate-700"
            onClick={() => setUiLang((prev) => (prev === "zh" ? "en" : "zh"))}
          >
            {uiLang === "zh" ? "EN" : "\u4e2d\u6587"}
          </Button>
          <Button
            asChild
            className="h-9 rounded-full bg-[#236CFF] px-4 text-white shadow-[0_10px_26px_rgba(35,108,255,0.24)] hover:bg-[#1857D8]"
          >
            <a href="https://github.com/CodingFeng101/CanvasAnvil" target="_blank" rel="noreferrer" aria-label={copy.openRepo}>
              <Github className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Footer({ copy }: { copy: { footerLicense: string; footerContact: string } }) {
  return (
    <footer className="min-h-12 rounded-t-[22px] border border-b-0 border-white/80 bg-white/78 shadow-[0_-14px_42px_rgba(34,76,150,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-12 max-w-[1180px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs font-semibold text-slate-500">
        <a href="https://github.com/CodingFeng101/CanvasAnvil" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full px-2.5 py-1.5 transition hover:bg-[#EEF4FF] hover:text-[#236CFF]">
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <span className="h-4 w-px bg-[#DDE8FA]" />
        <span className="flex items-center gap-2 rounded-full px-2.5 py-1.5">
          <Scale className="h-4 w-4" />
          {copy.footerLicense}
        </span>
        <span className="h-4 w-px bg-[#DDE8FA]" />
        <a href="mailto:fengguodong972@gmail.com" className="flex items-center gap-2 rounded-full px-2.5 py-1.5 transition hover:bg-[#EEF4FF] hover:text-[#236CFF]">
          <Mail className="h-4 w-4" />
          {copy.footerContact}: fengguodong972@gmail.com
        </a>
      </div>
    </footer>
  );
}

function CanvasDetailPage({
  canvas,
  onEnterWorkspace,
}: {
  canvas: PortalWorkspace;
  onEnterWorkspace: (workspace: PortalWorkspace) => void;
}) {
  const uiLang = useUiLanguage();
  const config = getDetailConfig(canvas, uiLang);
  const Icon = canvasIcons[canvas];

  return (
    <section id={`portal-${canvas}`} className="flex h-full flex-col justify-center overflow-hidden py-2">
      <div className="grid gap-4 rounded-[22px] border border-[#D6E7FF]/70 bg-white/28 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.60)] xl:grid-cols-[0.78fr_1.22fr]">
        <div className="self-center">
          <h1 className="text-[clamp(30px,3.2vw,40px)] font-black leading-tight text-slate-950">{config.title}</h1>
          <h2 className="mt-1.5 text-[clamp(17px,1.8vw,20px)] font-black leading-tight text-[#236CFF]">{config.subtitle}</h2>
          <p className="mt-3 max-w-[560px] text-[15px] leading-7 text-slate-600">{config.intro}</p>

          <div className="mt-3 flex flex-wrap gap-3">
            {config.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#E6EEFC] bg-white px-4 py-2 text-[14px] font-bold leading-tight text-slate-700 shadow-[0_12px_28px_rgba(34,76,150,0.08)] transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] hover:border-[#BFD6FF] hover:shadow-[0_16px_34px_rgba(35,108,255,0.14)]"
              >
                <Icon className="h-4 w-4 text-[#236CFF]" />
                <span className="whitespace-normal">{tag}</span>
              </span>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {config.bullets.map((bullet) => (
              <div key={bullet} className="flex items-start gap-3 text-[15px] leading-7 text-slate-600">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#236CFF]" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {config.previews.map((preview, index) => (
            <div key={preview.title}>
              <div className="mb-1.5 pl-2 text-[16px] font-black text-slate-900">{preview.title}</div>
              <div className="relative rounded-[16px] border border-[#DDE8FA] bg-white/94 p-3 shadow-[0_16px_40px_rgba(34,76,150,0.12)]">
                <span className="absolute -left-2 -top-2 h-5 w-5 rounded-full bg-[#236CFF] shadow-[0_6px_16px_rgba(35,108,255,0.35)]" />
                <span className={cn("absolute -top-4 h-8 w-20 rotate-6 bg-[#C9E0F8]/70 shadow-sm", index % 2 === 0 ? "right-14" : "right-24")} />
                <span className="absolute right-3 top-3 h-8 w-8 rounded-bl-2xl border-b border-l border-[#DDE8FA] bg-gradient-to-br from-white/20 to-[#EEF4FF]" />
                <a href={preview.image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-[#EEF3FE] bg-[#F7FAFF]">
                  <img src={preview.image} alt={preview.title} className="h-[112px] w-full object-contain" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 rounded-[22px] border border-white/80 bg-white/66 p-3 shadow-[0_16px_44px_rgba(34,76,150,0.08)]">
        <div className="mb-2 text-[20px] font-black text-slate-950">
          <span className="border-b-4 border-[#236CFF] pb-1">{uiLang === "zh" ? "实现流程" : "Workflow"}</span>
        </div>

        <div className="grid gap-3 xl:grid-cols-6">
          {config.steps.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <div key={step.title} className="relative min-h-[118px] rounded-xl border border-[#E3ECFA] bg-white p-3 shadow-[0_12px_28px_rgba(34,76,150,0.08)]">
                {index < config.steps.length - 1 && (
                  <div className="pointer-events-none absolute -right-5 top-1/2 hidden h-px w-5 bg-[#236CFF] xl:block">
                    <span className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-[#236CFF]" />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#236CFF] text-sm font-black text-white">{index + 1}</span>
                  <div className="text-[14px] font-black leading-tight text-slate-900">{step.title}</div>
                </div>
                <div className="mt-1.5 flex h-8 items-center justify-center text-[#236CFF]">
                  <StepIcon className="h-7 w-7 stroke-[1.8]" />
                </div>
                <p className="mt-1 text-[12px] leading-5 text-slate-600">{step.text}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-col items-center">
          <div className="max-w-full text-center text-[15px] font-semibold leading-6 tracking-[0.04em] text-[#236CFF]">{config.slogan}</div>
          <button
            className="group relative mt-2 h-[58px] min-w-[300px] max-w-full overflow-visible px-12 text-[clamp(18px,2vw,22px)] font-black tracking-[0.08em] text-white transition duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#236CFF]/40"
            onClick={() => onEnterWorkspace(canvas)}
          >
            <svg viewBox="0 0 320 72" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_18px_28px_rgba(35,108,255,0.28)] transition duration-300 group-hover:scale-[1.035]" aria-hidden="true">
              <path d="M10 38 C34 16 82 17 126 23 C170 29 204 16 253 20 C289 23 310 34 314 41 C291 55 248 53 203 55 C154 58 108 62 62 55 C32 51 16 46 10 38Z" fill="#0758D8" />
              <path d="M25 40 C69 26 116 32 158 31 C207 29 253 27 296 39 C255 50 207 48 160 52 C108 56 59 51 25 40Z" fill="#236CFF" />
              <path d="M39 27 C86 18 132 24 175 22 C216 20 250 18 285 27" fill="none" stroke="#A9D0FF" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
              <path d="M6 40 C22 45 33 50 45 60" fill="none" stroke="#0B77F4" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
              <path d="M279 54 C296 51 309 48 319 42" fill="none" stroke="#8EC1FF" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
            </svg>
            <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(5,62,168,0.45)]">{config.cta}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function SimpleCanvasDetailPage({
  canvas,
  onEnterWorkspace,
  onPreviewImage,
}: {
  canvas: PortalWorkspace;
  onEnterWorkspace: (workspace: PortalWorkspace) => void;
  onPreviewImage: (preview: PreviewImage) => void;
}) {
  const uiLang = useUiLanguage();
  const config = getDetailConfig(canvas, uiLang);
  const Icon = canvasIcons[canvas];
  const isEnglish = uiLang === "en";

  return (
    <section id={`portal-${canvas}`} className={cn("flex h-full items-center overflow-hidden", isEnglish ? "py-3" : "py-4")}>
      <div
        className={cn(
          "grid w-full rounded-[30px] border border-[#D6E7FF]/70 bg-white/32 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.62),0_24px_70px_rgba(34,76,150,0.08)] xl:grid-cols-[0.78fr_1.22fr]",
          isEnglish ? "gap-6 p-6 2xl:gap-8 2xl:p-8" : "gap-7 p-7 2xl:gap-9 2xl:p-9",
        )}
      >
        <div className="self-center">
          <h1 className={cn("font-black text-slate-950", isEnglish ? "text-[clamp(34px,3.5vw,50px)] leading-[1.03]" : "text-[clamp(42px,4.7vw,68px)] leading-[1.04]")}>{config.title}</h1>
          <h2 className={cn("font-black leading-tight text-[#236CFF]", isEnglish ? "mt-2 text-[clamp(18px,1.75vw,23px)]" : "mt-2.5 text-[clamp(23px,2.35vw,32px)]")}>{config.subtitle}</h2>
          <p className={cn("max-w-[620px] text-slate-600", isEnglish ? "mt-4 text-[clamp(15px,1.2vw,16px)] leading-7" : "mt-5 text-[18px] leading-8")}>{config.intro}</p>

          <div className={cn("flex flex-wrap", isEnglish ? "mt-5 gap-2.5" : "mt-6 gap-3")}>
            {config.tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "inline-flex max-w-full items-center gap-2 rounded-full border border-[#E6EEFC] bg-white font-bold leading-tight text-slate-700 shadow-[0_12px_28px_rgba(34,76,150,0.08)] transition duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] hover:border-[#BFD6FF] hover:shadow-[0_16px_34px_rgba(35,108,255,0.14)]",
                  isEnglish ? "px-4 py-2.5 text-[14px]" : "px-5 py-3 text-[16px]",
                )}
              >
                <Icon className="h-4 w-4 text-[#236CFF]" />
                <span className="whitespace-normal">{tag}</span>
              </span>
            ))}
          </div>

          <div className={cn(isEnglish ? "mt-5 space-y-2.5" : "mt-6 space-y-3")}>
            {config.bullets.map((bullet) => (
              <div key={bullet} className={cn("flex items-start gap-3 text-slate-600", isEnglish ? "text-[15px] leading-6" : "text-[18px] leading-7")}>
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#236CFF]" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>

          <div className={cn(isEnglish ? "mt-6" : "mt-7")}>
            <div className={cn("max-w-[540px] font-semibold tracking-[0.03em] text-[#236CFF]", isEnglish ? "mb-1.5 text-[16px] leading-6" : "mb-2 text-[20px] leading-7")}>{config.slogan}</div>
            <button
              className={cn(
                "group relative max-w-full overflow-visible px-12 font-black tracking-[0.08em] text-white transition duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#236CFF]/40",
                isEnglish ? "h-[64px] min-w-[340px] text-[clamp(19px,2vw,24px)]" : "h-[72px] min-w-[380px] text-[clamp(26px,2.55vw,32px)]",
              )}
              onClick={() => onEnterWorkspace(canvas)}
            >
              <svg viewBox="0 0 380 84" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_22px_34px_rgba(35,108,255,0.30)] transition duration-300 group-hover:scale-[1.035]" aria-hidden="true">
                <path d="M12 44 C42 17 96 19 150 26 C203 33 244 17 300 23 C342 27 370 39 374 48 C346 65 294 62 241 65 C181 69 127 73 72 64 C34 58 17 51 12 44Z" fill="#0758D8" />
                <path d="M32 47 C86 31 142 37 191 36 C250 34 304 31 356 46 C307 59 250 57 192 62 C130 67 71 60 32 47Z" fill="#236CFF" />
                <path d="M50 31 C105 21 161 29 211 26 C260 23 302 22 342 32" fill="none" stroke="#A9D0FF" strokeWidth="5" strokeLinecap="round" opacity="0.72" />
                <path d="M7 46 C26 52 41 59 56 72" fill="none" stroke="#0B77F4" strokeWidth="3.6" strokeLinecap="round" opacity="0.65" />
                <path d="M331 64 C350 60 367 55 379 47" fill="none" stroke="#8EC1FF" strokeWidth="3.6" strokeLinecap="round" opacity="0.78" />
              </svg>
              <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(5,62,168,0.45)]">{config.cta}</span>
            </button>
          </div>
        </div>

        <div className={cn("grid content-center md:grid-cols-2", isEnglish ? "gap-x-5 gap-y-3" : "gap-x-7 gap-y-5")}>
          {config.previews.map((preview, index) => (
            <div key={preview.title}>
              <div className={cn("pl-2 font-black leading-tight text-slate-900", isEnglish ? "mb-1.5 text-[15px]" : "mb-2 text-[18px]")}>{preview.title}</div>
              <button
                className={cn(
                  "relative block w-full rounded-[18px] border border-[#DDE8FA] bg-white/94 text-left shadow-[0_16px_40px_rgba(34,76,150,0.12)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(34,76,150,0.16)]",
                  isEnglish ? "p-3" : "p-4",
                )}
                onClick={() => onPreviewImage(preview)}
              >
                <span className="absolute -left-2 -top-2 h-5 w-5 rounded-full bg-[#236CFF] shadow-[0_6px_16px_rgba(35,108,255,0.35)]" />
                <span className={cn("absolute -top-4 h-8 w-20 rotate-6 bg-[#C9E0F8]/70 shadow-sm", index % 2 === 0 ? "right-14" : "right-24")} />
                <span className="absolute right-3 top-3 h-8 w-8 rounded-bl-2xl border-b border-l border-[#DDE8FA] bg-gradient-to-br from-white/20 to-[#EEF4FF]" />
                <span className="block overflow-hidden rounded-xl border border-[#EEF3FE] bg-[#F7FAFF]">
                  <img src={preview.image} alt={preview.title} className={cn("w-full object-contain", isEnglish ? "h-[150px] 2xl:h-[168px]" : "h-[170px] 2xl:h-[204px]")} />
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortalPage({ onEnterWorkspace }: PortalPageProps) {
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getUiLanguage());
  const [activeCanvas, setActiveCanvas] = useState<PortalWorkspace>("flow");
  const [activeSection, setActiveSection] = useState<PortalSection>("home");
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [paused, setPaused] = useState(false);
  const pageLockRef = useRef(false);
  const orderedSections: PortalSection[] = ["home", ...portalCanvasItems.map((item) => item.id)];

  const goToSection = (section: PortalSection) => {
    setActiveSection(section);
    if (section !== "home") setActiveCanvas(section);
  };

  const turnPage = (direction: 1 | -1) => {
    if (pageLockRef.current) return;
    const currentIndex = orderedSections.indexOf(activeSection);
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), orderedSections.length - 1);
    if (nextIndex === currentIndex) return;
    pageLockRef.current = true;
    goToSection(orderedSections[nextIndex]);
    window.setTimeout(() => {
      pageLockRef.current = false;
    }, 780);
  };

  useEffect(() => {
    setUiLanguage(uiLang);
  }, [uiLang]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      goToSection((event as CustomEvent<PortalSection>).detail);
    };
    document.addEventListener("portal:navigate", handleNavigate);
    return () => document.removeEventListener("portal:navigate", handleNavigate);
  }, []);

  const copy = uiLang === "zh"
    ? {
        home: "\u9996\u9875",
        titleA: "\u9762\u5411\u591a\u753b\u5e03",
        titleB: "\u521b\u4f5c\u7684",
        titleAccent: "\u667a\u80fd\u5de5\u4f5c\u53f0",
        intro:
          "CanvasAnvil \u652f\u6301\u516d\u79cd\u753b\u5e03\uff1a\u6d41\u7a0b\u753b\u5e03\u3001\u5ba4\u5185\u8bbe\u8ba1\u753b\u5e03\u3001PPT\u753b\u5e03\u3001\u6d77\u62a5\u753b\u5e03\u3001\u4fe1\u606f\u56fe\u753b\u5e03\u3001\u4ea7\u54c1\u4ecb\u7ecd\u753b\u5e03\u3002\u63d0\u4f9b\u7ed3\u6784\u5316\u751f\u6210\u4e0e\u672c\u5730\u5c40\u90e8\u4fee\u6539\u80fd\u529b\uff0c\u5e2e\u52a9\u4f60\u9ad8\u6548\u3001\u53ef\u63a7\u5730\u5b8c\u6210\u5404\u7c7b\u53ef\u89c6\u5316\u521b\u4f5c\u3002",
        tagA: "\u516d\u79cd\u753b\u5e03",
        tagB: "\u7ed3\u6784\u5316\u751f\u6210",
        tagC: "\u5c40\u90e8\u4fee\u6539",
        openRepo: "GitHub",
        footerLicense: "\u5f00\u6e90\u534f\u8bae\uff1aAGPL-3.0",
        footerContact: "\u8054\u7cfb\u65b9\u5f0f",
        hub: "CanvasAnvil",
        hubSub: "\u591a\u753b\u5e03\u5de5\u4f5c\u53f0",
        mobileHint: "\u70b9\u51fb\u5361\u7247\u8fdb\u5165\u5bf9\u5e94\u753b\u5e03",
      }
    : {
        home: "Home",
        titleA: "An open-source project",
        titleB: "for multi-canvas",
        titleAccent: "creation",
        intro:
          "CanvasAnvil supports six canvases: flow, interior, PPT, poster, infographic, and product. It combines structured generation with local Patch / Replace editing so visual creation stays fast and controllable.",
        tagA: "Six Canvases",
        tagB: "Structured Output",
        tagC: "Patch and Replace",
        openRepo: "GitHub",
        footerLicense: "License: AGPL-3.0",
        footerContact: "Contact",
        hub: "CanvasAnvil",
        hubSub: "Multi-canvas workspace",
        mobileHint: "Tap a card to enter its workspace",
      };

  return (
    <div className="h-screen overflow-hidden bg-[#F6FAFF] text-slate-950" style={{ cursor: brushCursor }}>
      <style>{`
        .portal-brush-cursor,
        .portal-brush-cursor * {
          cursor: ${brushCursor} !important;
        }
        @keyframes portal-card-orbit {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes portal-card-counter {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(-360deg); }
        }
        @keyframes portal-node-pulse {
          0%, 100% { opacity: 0.72; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.16); }
        }
        @keyframes portal-ring-breathe {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(rgba(35,108,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(35,108,255,0.10) 1px, transparent 1px), radial-gradient(circle at 1px 1px, rgba(35,108,255,0.14) 1px, transparent 0)",
            backgroundSize: "96px 96px, 96px 96px, 22px 22px",
          }}
        />
        <div className="absolute left-8 right-8 top-6 h-px bg-[#236CFF]/20" />
        <div className="absolute bottom-8 left-8 right-8 h-px bg-[#236CFF]/16" />
        <div className="absolute bottom-8 left-8 top-6 w-px bg-[#236CFF]/18" />
        <div className="absolute bottom-8 right-8 top-6 w-px bg-[#236CFF]/14" />
        <div className="absolute left-16 top-[170px] h-28 w-80 -rotate-12 rounded-full border-t-[18px] border-[#236CFF]/12" />
        <div className="absolute bottom-16 left-20 h-20 w-64 rotate-[-18deg] border-b-2 border-l-2 border-[#236CFF]/18" />
        <div className="absolute right-20 top-36 h-20 w-64 rotate-[-8deg] border-t-2 border-[#236CFF]/18" />
        <svg className="absolute inset-0 h-full w-full opacity-45" viewBox="0 0 1500 980" preserveAspectRatio="none">
          <path d="M44 861 C151 783 224 766 305 690" fill="none" stroke="#236CFF" strokeWidth="2" strokeOpacity="0.18" strokeDasharray="8 12" />
          <path d="M1240 146 C1300 134 1360 142 1416 118" fill="none" stroke="#236CFF" strokeWidth="2" strokeOpacity="0.16" />
          <path d="M80 150 h62 v62 h-62z" fill="none" stroke="#236CFF" strokeWidth="2" strokeOpacity="0.12" strokeDasharray="6 8" />
          <path d="M1426 706 l-16 28 -16 -28" fill="none" stroke="#236CFF" strokeWidth="2" strokeOpacity="0.18" />
          <path d="M556 308 l14 23 23 14 -23 14 -14 23 -14 -23 -23 -14 23 -14 14 -23z" fill="#236CFF" fillOpacity="0.18" />
        </svg>
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#EAF2FF] to-transparent" />
      </div>

      <div
        className="portal-brush-cursor relative h-screen overflow-hidden"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) < 18) return;
          turnPage(event.deltaY > 0 ? 1 : -1);
        }}
      >
        <div className="sticky top-0 z-40 mx-auto w-full max-w-[1500px] px-4 pt-4 sm:px-6 lg:px-10">
        <Header
          uiLang={uiLang}
          copy={copy}
          activeCanvas={activeCanvas}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          setActiveCanvas={setActiveCanvas}
          setUiLang={setUiLang}
        />
        </div>

        <div className="relative mx-auto h-[calc(100vh-160px)] w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
          <AnimatePresence mode="sync">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 18, scale: 0.992, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -14, scale: 0.992, filter: "blur(6px)" }}
              transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-4 top-0 h-full sm:inset-x-6 lg:inset-x-10"
            >
        {activeSection === "home" ? (
        <main id="portal-home" className="grid h-full items-center gap-8 py-2 xl:grid-cols-[0.88fr_1.12fr]">
          <section className="max-w-[650px] px-2">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-[clamp(34px,4.2vw,64px)] font-black leading-[1.08] text-slate-950">
                <span className="block">{copy.titleA}</span>
                <span className="block">
                  <span>{copy.titleB}</span>
                  <span className="text-[#236CFF]">{copy.titleAccent}</span>
                </span>
              </h1>
              <p className="mt-7 max-w-[620px] text-[clamp(16px,1.35vw,18px)] leading-8 text-slate-600">
                {copy.intro}
              </p>

              <div className="mt-8 h-px w-64 bg-gradient-to-r from-[#236CFF]/60 via-[#8EC1FF]/45 to-transparent" />
            </motion.div>
          </section>

          <section className="hidden justify-center xl:flex">
            <div
              className="relative h-[650px] w-[720px]"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <div className="absolute left-[74px] top-2 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,#FFFFFF_0%,rgba(239,246,255,0.88)_45%,rgba(218,232,255,0.30)_73%,transparent_100%)]" />
              <div className="absolute left-[238px] top-[172px] h-[280px] w-[280px] rotate-[-5deg] rounded-[28px] border border-[#D6E7FF]/80 bg-white/58 shadow-[0_24px_70px_rgba(34,76,150,0.10)]" />
              <div className="absolute left-[252px] top-[186px] h-[280px] w-[280px] rotate-[4deg] rounded-[28px] border border-[#D6E7FF]/70 bg-[#F8FBFF]/58 shadow-[0_18px_54px_rgba(34,76,150,0.08)]" />

              <svg viewBox="0 0 720 720" className="absolute left-[384px] top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2">
                <defs>
                  <marker id="orbit-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="rgba(35,108,255,0.72)" />
                  </marker>
                  <filter id="canvas-paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#224C96" floodOpacity="0.10" />
                  </filter>
                </defs>

                <rect x="258" y="258" width="204" height="204" rx="28" fill="rgba(255,255,255,0.58)" stroke="rgba(35,108,255,0.13)" filter="url(#canvas-paper-shadow)" />
                <path d="M286 314 H432 M286 360 H432 M286 406 H432" stroke="rgba(35,108,255,0.11)" strokeWidth="2" strokeLinecap="round" />
                <path d="M314 286 V434 M360 286 V434 M406 286 V434" stroke="rgba(35,108,255,0.08)" strokeWidth="2" strokeLinecap="round" />

                <circle cx="360" cy="360" r="250" fill="none" stroke="rgba(35,108,255,0.16)" strokeWidth="1.6" strokeDasharray="4 10" />
                <circle cx="360" cy="360" r="205" fill="none" stroke="rgba(35,108,255,0.18)" strokeWidth="2.2" />
                <circle cx="360" cy="360" r="160" fill="none" stroke="rgba(35,108,255,0.13)" strokeWidth="1.6" strokeDasharray="11 9" />
                <circle cx="360" cy="360" r="112" fill="none" stroke="rgba(35,108,255,0.19)" strokeWidth="2.6" />

                <path d="M232 190 A205 205 0 0 1 500 230" fill="none" stroke="rgba(35,108,255,0.74)" strokeWidth="2.3" markerEnd="url(#orbit-arrow)" />
                <path d="M525 456 A205 205 0 0 1 380 566" fill="none" stroke="rgba(35,108,255,0.58)" strokeWidth="2.2" markerEnd="url(#orbit-arrow)" />
                <path d="M190 462 A205 205 0 0 1 166 322" fill="none" stroke="rgba(35,108,255,0.50)" strokeWidth="2.1" markerEnd="url(#orbit-arrow)" />

                {[14, 78, 142, 206, 270, 334].map((angle, index) => (
                  <OrbitNode key={angle} angle={angle} radius={250} delay={index * 0.22} />
                ))}
                {[36, 130, 224, 318].map((angle, index) => (
                  <OrbitNode key={angle} angle={angle} radius={205} delay={index * 0.35} />
                ))}
              </svg>

              <div
                className="absolute left-[384px] top-1/2 h-[540px] w-[540px]"
                style={{
                  animation: "portal-card-orbit 38s linear infinite",
                  animationPlayState: paused ? "paused" : "running",
                }}
              >
                {portalCanvasItems.map((item) => (
                  <OrbitCard
                    key={item.id}
                    item={item}
                    uiLang={uiLang}
                    active={item.id === activeCanvas}
                    paused={paused}
                    onActive={() => setActiveCanvas(item.id)}
                    onClick={() => {
                      setActiveCanvas(item.id);
                      setActiveSection(item.id);
                      scrollToPortalSection(item.id);
                    }}
                  />
                ))}
              </div>

              <div className="absolute left-[384px] top-1/2 h-[248px] w-[248px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#AFCBFF] bg-white shadow-[0_24px_90px_rgba(35,108,255,0.18)]">
                <div className="absolute inset-4 rounded-full border border-[#E2ECFF]" style={{ animation: "portal-ring-breathe 5s ease-in-out infinite" }} />
                <div className="absolute inset-8 rounded-full bg-[radial-gradient(circle,#FFFFFF_0%,#F3F7FF_100%)] shadow-[inset_0_0_0_8px_rgba(35,108,255,0.06),0_0_0_2px_rgba(35,108,255,0.08)]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <BrandIcon className="h-20 w-20" />
                  <div className="mt-4 text-2xl font-black text-slate-950">{copy.hub}</div>
                  <div className="mt-2 text-sm text-slate-500">{copy.hubSub}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="xl:hidden">
            <div className="mb-3 text-sm font-semibold text-[#236CFF]">{copy.mobileHint}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {portalCanvasItems.map((item) => (
                <button
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-[#E6EEFC] bg-white p-3 text-left shadow-[0_12px_28px_rgba(34,76,150,0.08)]"
                  onMouseEnter={() => setActiveCanvas(item.id)}
                  onFocus={() => setActiveCanvas(item.id)}
                  onClick={() => {
                    setActiveCanvas(item.id);
                    setActiveSection(item.id);
                    scrollToPortalSection(item.id);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{uiLang === "zh" ? item.zhTitle : item.enTitle}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.accent }} />
                  </div>
                  <img src={item.image} alt={uiLang === "zh" ? item.zhTitle : item.enTitle} className="h-[128px] w-full rounded-xl border border-[#EEF3FE] object-cover object-top" />
                </button>
              ))}
            </div>
          </section>
        </main>
        ) : (
          <SimpleCanvasDetailPage
            canvas={activeSection}
            onEnterWorkspace={onEnterWorkspace}
            onPreviewImage={setPreviewImage}
          />
        )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 px-4 sm:px-6 lg:px-10">
          <Footer copy={copy} />
        </div>

        <AnimatePresence>
          {previewImage && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/52 p-8 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewImage(null)}
            >
              <motion.div
                className="relative max-h-[86vh] w-full max-w-[1180px] rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_28px_90px_rgba(7,31,75,0.28)]"
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.96 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="text-[22px] font-black text-slate-950">{previewImage.title}</div>
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#DDE8FA] bg-[#F7FAFF] text-slate-600 transition hover:bg-[#EAF2FF] hover:text-[#236CFF]"
                    onClick={() => setPreviewImage(null)}
                    aria-label={uiLang === "zh" ? "关闭预览" : "Close preview"}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex max-h-[72vh] items-center justify-center overflow-hidden rounded-2xl border border-[#E3ECFA] bg-[#F7FAFF]">
                  <img src={previewImage.image} alt={previewImage.title} className="max-h-[72vh] w-full object-contain" />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
