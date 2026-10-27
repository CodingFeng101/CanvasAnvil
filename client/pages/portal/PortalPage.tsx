import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
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
  Paintbrush,
  Pencil,
  Presentation,
  Scale,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { getUiLanguage, setUiLanguage, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { SPRING, Stagger, StaggerItem, TWEEN, liftOnHover, pressable } from "@/shared/motion";
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
      <circle cx={360 + point.x} cy={360 + point.y} r="15" fill="hsl(var(--primary) / 0.10)" />
      <circle cx={360 + point.x} cy={360 + point.y} r="6.5" fill="hsl(var(--primary))" />
      <circle cx={360 + point.x} cy={360 + point.y} r="2.5" fill="hsl(var(--card))" />
    </g>
  );
}

function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center", className)}>
      <svg viewBox="0 0 48 48" role="img" aria-label="CanvasAnvil" className="h-full w-full drop-shadow-[0_6px_14px_rgba(122,53,32,0.18)]">
        <path d="M24 3.8 42 12.8 24 21.8 6 12.8 24 3.8Z" fill="#C96442" />
        <path d="M24 8.6 32.4 12.8 24 17 15.6 12.8 24 8.6Z" fill="#EFB8A2" />
        <path d="M8.8 17.5 24 25.1l15.2-7.6v5.7L24 30.8 8.8 23.2v-5.7Z" fill="#B4522F" />
        <path d="M16.5 29.3h15l-2.7 4.4h-9.6l-2.7-4.4Z" fill="#7A3520" />
        <path d="M18.8 33.1h10.4v5.1H18.8v-5.1Z" fill="#C96442" />
        <path d="M13.2 38.1h21.6l3 5.4H10.2l3-5.4Z" fill="#A0472A" />
        <path d="M19.5 39.4h9" stroke="#F5D3C4" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const canvasIcons: Record<PortalWorkspace, typeof Blocks> = {
  diagram: Blocks,
  cad: Home,
  ppt: Presentation,
  canvas: Paintbrush,
};

const detailConfigs: Record<PortalWorkspace, DetailConfig> = {
  diagram: {
    title: "\u56fe\u8868\u7ed8\u5236",
    subtitle: "\u4e00\u53e5\u9700\u6c42\uff0c\u5feb\u901f\u751f\u6210\u7ed3\u6784\u5316\u56fe\u8868",
    intro: "\u56fe\u8868\u7ed8\u5236\u8ba9\u4f60\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u6d41\u7a0b\uff0c\u81ea\u52a8\u751f\u6210\u53ef\u7f16\u8f91\u7684\u56fe\u8868\u3002\u652f\u6301\u8282\u70b9\u4e0e\u8fde\u7ebf\u7f16\u8f91\u3001\u5c40\u90e8\u4fee\u6539\uff0c\u5e76\u53ef\u5bfc\u51fa draw.io XML\u3002",
    tags: ["\u7ed3\u6784\u5316\u751f\u6210", "\u5c40\u90e8\u4fee\u6539", "draw.io XML"],
    bullets: ["\u667a\u80fd\u89e3\u6790\u9700\u6c42\uff0c\u81ea\u52a8\u62bd\u53d6\u6d41\u7a0b\u8282\u70b9\u4e0e\u5173\u7cfb", "\u652f\u6301\u8282\u70b9\u4e0e\u8fde\u7ebf\u7f16\u8f91\uff0c\u62d6\u62fd\u5373\u6539", "\u5c40\u90e8\u4fee\u6539\uff0c\u5feb\u901f\u5fae\u8c03\u590d\u6742\u6d41\u7a0b", "\u5bfc\u51fa draw.io XML\uff0c\u4fbf\u4e8e\u590d\u7528\u4e0e\u534f\u4f5c"],
    previews: [
      { title: "\u5b66\u672f\u7814\u7a76\u6846\u67b6\u56fe", image: "/examples/readme-previews/diagram/01.png" },
      { title: "\u667a\u80fd\u95ee\u7b54\u7cfb\u7edf\u67b6\u6784", image: "/examples/readme-previews/diagram/02.png" },
      { title: "\u9879\u76ee\u5b9e\u65bd\u8def\u7ebf\u56fe", image: "/examples/readme-previews/diagram/03.png" },
      { title: "\u8bfe\u7a0b\u8bbe\u8ba1\u601d\u7ef4\u5bfc\u56fe", image: "/examples/readme-previews/diagram/04.png" },
    ],
    steps: [
      { title: "\u8f93\u5165\u9700\u6c42", text: "\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u6d41\u7a0b\u76ee\u6807\u4e0e\u7ea6\u675f\u3002", icon: FileText },
      { title: "\u7ed3\u6784\u5316\u89e3\u6790", text: "AI \u62bd\u53d6\u8282\u70b9\u3001\u5173\u7cfb\u4e0e\u65b9\u5411\u3002", icon: Share2 },
      { title: "\u751f\u6210 XML", text: "\u8f6c\u6362\u4e3a draw.io \u517c\u5bb9\u7684\u56fe\u8868\u6570\u636e\u3002", icon: Code2 },
      { title: "\u9884\u89c8\u4e0e\u6821\u9a8c", text: "\u68c0\u67e5\u8282\u70b9\u4e0e\u8fde\u7ebf\u662f\u5426\u7b26\u5408\u9884\u671f\u3002", icon: ChartNoAxesCombined },
      { title: "\u5c40\u90e8\u4fee\u6539", text: "\u5bf9\u8282\u70b9\u6216\u8fde\u7ebf\u8fdb\u884c\u7cbe\u7ec6\u8c03\u6574\u3002", icon: Pencil },
      { title: "\u5bfc\u51fa\u590d\u7528", text: "\u5bfc\u51fa draw.io XML\uff0c\u7528\u4e8e\u534f\u4f5c\u4e0e\u590d\u7528\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u56fe\u8868\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u521b\u4f5c",
  },
  cad: {
    title: "\u5ba4\u5185\u8bbe\u8ba1",
    subtitle: "\u4ece\u7a7a\u95f4\u9700\u6c42\u5230\u6210\u5957\u56fe\u7eb8\u4e0e\u6e32\u67d3",
    intro: "\u5ba4\u5185\u8bbe\u8ba1\u5c06\u7a7a\u95f4\u9700\u6c42\u8f6c\u5316\u4e3a\u5b8c\u6574\u7684\u8bbe\u8ba1\u65b9\u6848\uff0c\u81ea\u52a8\u751f\u6210\u5e73\u9762\u5e03\u5c40\u3001\u7acb\u9762\u4e0e\u8be6\u56fe\uff0c\u8f93\u51fa\u6e32\u67d3\u53ca\u6750\u6599\u6e05\u5355\u3002",
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
    cta: "\u5f00\u59cb\u8bbe\u8ba1",
    slogan: "\u8ba9\u5ba4\u5185\u8bbe\u8ba1\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u521b\u4f5c",
  },
  ppt: {
    title: "PPT \u6f14\u793a",
    subtitle: "\u4ece\u4e3b\u9898\u5230\u6f14\u793a\u6587\u7a3f\uff0c\u6309\u9875\u9762\u6301\u7eed\u8fed\u4ee3",
    intro: "PPT \u6f14\u793a\u5c06\u4e3b\u9898\u7ed3\u6784\u5316\u4e3a\u53ef\u6f14\u793a\u7684\u903b\u8f91\u5185\u5bb9\uff0c\u81ea\u52a8\u751f\u6210\u6f14\u793a\u6587\u7a3f\u5927\u7eb2\u5e76\u62c6\u5206\u9875\u9762\u7c7b\u578b\uff0c\u652f\u6301\u9875\u9762\u751f\u6210\u4e0e\u5c40\u90e8\u8fed\u4ee3\u3002",
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
    cta: "\u5f00\u59cb\u5236\u4f5c",
    slogan: "\u8ba9\u6f14\u793a\u521b\u4f5c\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u6d41\u7545",
  },
  canvas: {
    title: "\u81ea\u7531\u753b\u5e03",
    subtitle: "\u4e00\u53e5\u8bdd\u751f\u6210\u56fe\u7247\uff0c\u5708\u4e00\u5708\u5c31\u80fd\u6539\u56fe",
    intro: "\u81ea\u7531\u753b\u5e03\u662f\u4e00\u5757\u767d\u677f\uff1a\u7528\u4e00\u53e5\u8bdd\u751f\u6210\u56fe\u7247\u5e76\u76f4\u63a5\u653e\u4e0a\u753b\u5e03\uff0c\u518d\u7528\u7bad\u5934\u3001\u5708\u9009\u3001\u624b\u7ed8\u6216\u6587\u5b57\u5728\u56fe\u4e0a\u6807\u51fa\u60f3\u6539\u7684\u5730\u65b9\uff0cAI \u8bfb\u61c2\u6807\u6ce8\u540e\u751f\u6210\u4fee\u6539\u7248\uff0c\u6bcf\u4e00\u7248\u90fd\u7559\u5728\u7248\u672c\u8c31\u7cfb\u91cc\u3002",
    tags: ["\u6587\u751f\u56fe", "\u6807\u6ce8\u6539\u56fe", "\u7248\u672c\u8c31\u7cfb"],
    bullets: ["\u4e00\u53e5\u8bdd\u751f\u6210\u56fe\u7247\uff0c\u81ea\u52a8\u6446\u653e\u5230\u753b\u5e03\u7a7a\u4f4d", "\u7bad\u5934\u3001\u5708\u9009\u3001\u624b\u7ed8\u3001\u6587\u5b57\u76f4\u63a5\u753b\u5728\u56fe\u4e0a\u5f53\u4fee\u6539\u8bf4\u660e", "\u53d1\u9001\u524d\u9884\u89c8 AI \u770b\u5230\u7684\u6807\u6ce8\uff0c\u5e76\u56de\u663e\u5b83\u8bfb\u51fa\u7684\u4fee\u6539\u610f\u56fe", "\u6bcf\u6b21\u4fee\u6539\u751f\u6210\u65b0\u7248\u672c\u5e76\u4fdd\u7559\u8c31\u7cfb\uff0c\u53ef\u968f\u65f6\u5207\u6362\u5bf9\u6bd4"],
    previews: [
      { title: "\u4e00\u53e5\u8bdd\u751f\u6210\u56fe\u7247", image: "/examples/canvas/01.svg" },
      { title: "\u5728\u56fe\u4e0a\u5708\u753b\u6807\u6ce8", image: "/examples/canvas/02.svg" },
      { title: "\u6309\u6807\u6ce8\u751f\u6210\u65b0\u7248", image: "/examples/canvas/03.svg" },
      { title: "\u7248\u672c\u8c31\u7cfb\u5bf9\u6bd4", image: "/examples/canvas/04.svg" },
    ],
    steps: [
      { title: "\u63cf\u8ff0\u753b\u9762", text: "\u7528\u4e00\u53e5\u8bdd\u63cf\u8ff0\u60f3\u8981\u7684\u56fe\u7247\u3002", icon: FileText },
      { title: "\u751f\u6210\u4e0a\u677f", text: "\u56fe\u7247\u751f\u6210\u540e\u81ea\u52a8\u653e\u5230\u753b\u5e03\u7a7a\u4f4d\u3002", icon: Image },
      { title: "\u5708\u753b\u6807\u6ce8", text: "\u7528\u7bad\u5934\u3001\u5708\u9009\u6216\u6587\u5b57\u6807\u51fa\u8981\u6539\u7684\u5730\u65b9\u3002", icon: Pencil },
      { title: "\u9884\u89c8\u786e\u8ba4", text: "\u67e5\u770b AI \u5c06\u8981\u8bfb\u53d6\u7684\u6807\u6ce8\u753b\u9762\u3002", icon: ChartNoAxesCombined },
      { title: "\u751f\u6210\u65b0\u7248", text: "AI \u6309\u6807\u6ce8\u4fee\u6539\u5e76\u653e\u4e0a\u65b0\u7248\u672c\u3002", icon: Share2 },
      { title: "\u7248\u672c\u5bf9\u6bd4", text: "\u5728\u8c31\u7cfb\u4e2d\u5207\u6362\u3001\u5bf9\u6bd4\u5404\u4e2a\u7248\u672c\u3002", icon: Layers3 },
    ],
    cta: "\u5f00\u59cb\u521b\u4f5c",
    slogan: "\u8ba9\u7075\u611f\u5728\u753b\u5e03\u4e0a\u81ea\u7531\u751f\u957f",
  },
};

/**
 * The same preview images under English titles. The English pages used to
 * reuse the Chinese preview list whole, so every caption stayed in Chinese.
 */
function withTitles(previews: PreviewImage[], titles: string[]): PreviewImage[] {
  return previews.map((preview, index) => ({ ...preview, title: titles[index] ?? preview.title }));
}

const detailConfigsEn: Record<PortalWorkspace, DetailConfig> = {
  diagram: {
    title: "Diagram",
    subtitle: "Turn a short requirement into a structured diagram",
    intro: "The Diagram workspace converts natural-language process descriptions into editable diagrams. It supports node and connector edits, local revisions, and draw.io XML export.",
    tags: ["Structured diagrams", "Local edits", "draw.io XML"],
    bullets: ["Parse requirements into nodes and relationships", "Edit nodes and connectors directly", "Revise selected parts without regenerating the whole diagram", "Export draw.io XML for collaboration and reuse"],
    previews: withTitles(detailConfigs.diagram.previews, ["Research framework", "Q&A system architecture", "Project roadmap", "Course design mind map"]),
    steps: [
      { title: "Describe", text: "Enter goals, process details, and constraints.", icon: FileText },
      { title: "Analyze", text: "AI extracts nodes, relationships, and directions.", icon: Share2 },
      { title: "Generate XML", text: "Convert the structure into draw.io-compatible data.", icon: Code2 },
      { title: "Review", text: "Check whether nodes and links match your intent.", icon: ChartNoAxesCombined },
      { title: "Revise", text: "Fine-tune selected nodes or connectors.", icon: Pencil },
      { title: "Export", text: "Export XML for reuse and collaboration.", icon: Upload },
    ],
    cta: "Start Drawing",
    slogan: "Create diagrams with the freedom of a canvas",
  },
  cad: {
    title: "Interior Design",
    subtitle: "From spatial requirements to drawings, renders, and material lists",
    intro: "The Interior Design workspace turns room requirements into design packages, including layouts, elevations, details, render references, and material lists.",
    tags: ["Space planning", "2D SVG", "Renders / Materials"],
    bullets: ["Analyze floor plans and functional zones", "Generate linked plan, elevation, ceiling, and detail drawings", "Use render references and material cues to present the space", "Export drawings and material lists for delivery"],
    previews: withTitles(detailConfigs.cad.previews, ["Furnished floor plan", "Floor finish plan", "Reflected ceiling plan", "Construction details"]),
    steps: [
      { title: "Input Brief", text: "Provide room information and design needs.", icon: FileText },
      { title: "Plan Space", text: "Analyze zoning and circulation.", icon: Package },
      { title: "Create Plan", text: "Generate layout drawings and dimensions.", icon: Home },
      { title: "Link Drawings", text: "Connect elevations, ceilings, and details.", icon: Layers3 },
      { title: "Render Check", text: "Generate render references and review materials.", icon: Image },
      { title: "Export", text: "Export drawings and material lists.", icon: Upload },
    ],
    cta: "Start Designing",
    slogan: "Make interior design feel as fluid as a canvas",
  },
  ppt: {
    title: "PPT",
    subtitle: "From topic to deck, with page-level iteration",
    intro: "The PPT workspace structures your topic into a presentation outline, splits it into slide types, and supports slide generation, review, and local revision.",
    tags: ["Outline first", "Slide editing", "Template aligned"],
    bullets: ["Turn a topic into a clear deck outline", "Split content into cover, agenda, chart, and conclusion slides", "Revise or extend individual slides", "Export editable presentation files"],
    previews: withTitles(detailConfigs.ppt.previews, ["AI content creation", "Growth through collaboration", "Business innovation", "Low-carbon campus"]),
    steps: [
      { title: "Input Topic", text: "Enter the topic and target audience.", icon: FileText },
      { title: "Build Outline", text: "Generate chapters and narrative structure.", icon: Share2 },
      { title: "Split Slides", text: "Identify cover, agenda, chart, and summary pages.", icon: Blocks },
      { title: "Generate", text: "Create slides from the outline and page types.", icon: Presentation },
      { title: "Iterate", text: "Rewrite, extend, or adjust selected pages.", icon: Pencil },
      { title: "Export PPT", text: "Export an editable PPT file.", icon: Upload },
    ],
    cta: "Start Building",
    slogan: "Make presentation creation smooth and visual",
  },
  canvas: {
    title: "Free Canvas",
    subtitle: "Prompt an image, then circle what to change",
    intro: "Free Canvas is a whiteboard: generate an image from one sentence and place it on the board, then mark it up with arrows, circles, strokes, or text. AI reads the markup, produces a revised version, and keeps every version in a lineage.",
    tags: ["Text to image", "Edit by annotation", "Version lineage"],
    bullets: ["Generate images from a prompt and place them in free space", "Draw arrows, circles, strokes, or notes on the image as edit instructions", "Preview the markup AI will read, and see how it interpreted the edit", "Each edit becomes a new version you can switch between and compare"],
    previews: withTitles(detailConfigs.canvas.previews, ["An image from one sentence", "Mark it up on the board", "A new version from the marks", "Compare the versions"]),
    steps: [
      { title: "Describe", text: "Describe the image in one sentence.", icon: FileText },
      { title: "Place", text: "The result lands in free space on the board.", icon: Image },
      { title: "Annotate", text: "Mark what to change with arrows, circles, or text.", icon: Pencil },
      { title: "Preview", text: "Check the markup AI is about to read.", icon: ChartNoAxesCombined },
      { title: "Revise", text: "AI applies the markup as a new version.", icon: Share2 },
      { title: "Compare", text: "Switch between versions in the lineage.", icon: Layers3 },
    ],
    cta: "Start Creating",
    slogan: "Let ideas grow freely on the canvas",
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
          {...liftOnHover}
          className={cn(
            "group w-[160px] overflow-hidden rounded-2xl border bg-card p-2.5 text-left shadow-soft",
            "transition-[border-color,box-shadow] duration-base ease-out-soft",
            active ? "border-primary/40 shadow-soft-lg" : "border-border/70",
          )}
          onMouseEnter={onActive}
          onFocus={onActive}
          onClick={onClick}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-foreground/70">
                <Icon className="h-4 w-4" />
              </span>
              <div className="line-clamp-2 text-[13px] font-semibold leading-4 text-foreground">
                {uiLang === "zh" ? item.zhTitle : item.enTitle}
              </div>
            </div>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.accent }} />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-sunken">
            <img
              src={item.image}
              alt={uiLang === "zh" ? item.zhTitle : item.enTitle}
              className="h-[96px] w-full object-cover object-top transition-transform duration-slow ease-out-soft group-hover:scale-[1.04]"
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
  activeSection,
  setActiveSection,
  setActiveCanvas,
  setUiLang,
}: {
  uiLang: UiLanguage;
  copy: { home: string; openRepo: string };
  activeSection: PortalSection;
  setActiveSection: (section: PortalSection) => void;
  setActiveCanvas: (workspace: PortalWorkspace) => void;
  setUiLang: Dispatch<SetStateAction<UiLanguage>>;
}) {
  const isChinese = uiLang === "zh";

  return (
    <header className="rounded-2xl border border-border/60 bg-card/85 px-4 py-2.5 shadow-soft backdrop-blur-xl lg:px-6">
      {/* Below xl: logo and buttons share the first row, the nav takes the
          second. It used to stack all three, spending a third row -- about
          60px of an already short page -- on two small buttons. */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 xl:grid-cols-[220px_minmax(0,1fr)_132px] xl:gap-3">
        <button
          className="group col-start-1 row-start-1 flex items-center gap-3 justify-self-start text-left"
          onClick={() => {
            setActiveSection("home");
            setActiveCanvas("diagram");
            scrollToPortalSection("home");
          }}
        >
          <BrandIcon className="h-9 w-9 transition-transform duration-base ease-out-soft group-hover:-rotate-6" />
          <span className="font-display text-[21px] font-semibold tracking-[-0.015em] text-foreground">CanvasAnvil</span>
        </button>

        <nav className="col-span-2 row-start-2 overflow-x-auto xl:col-span-1 xl:col-start-2 xl:row-start-1">
          <div className="flex min-w-max items-center justify-center gap-2 2xl:gap-4">
            {[{ id: "home" as const, label: copy.home }, ...portalCanvasItems.map((item) => ({
              id: item.id,
              label: uiLang === "zh" ? item.zhTitle : item.enTitle,
            }))].map(({ id, label }) => {
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  className={cn(
                    "relative whitespace-normal px-2.5 pb-2.5 pt-2 text-center font-medium leading-tight 2xl:max-w-none",
                    "transition-colors duration-fast ease-out-soft",
                    isChinese ? "max-w-[118px] text-[15px] 2xl:text-[16px]" : "max-w-[112px] text-[13px] 2xl:text-[14px]",
                    isActive ? "text-primary-strong" : "text-foreground/70 hover:text-foreground",
                  )}
                  onMouseEnter={() => id !== "home" && setActiveCanvas(id)}
                  onFocus={() => id !== "home" && setActiveCanvas(id)}
                  onClick={() => {
                    if (id !== "home") setActiveCanvas(id);
                    setActiveSection(id);
                    scrollToPortalSection(id);
                  }}
                >
                  {label}
                  {/* One rule slides between items rather than four borders
                      blinking on and off. */}
                  {isActive && (
                    <motion.span
                      layoutId="portal-nav-underline"
                      transition={SPRING.snap}
                      className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="col-start-2 row-start-1 flex justify-end gap-2 xl:col-start-3">
          <Button
            variant="outline"
            className="h-9 rounded-full px-4"
            onClick={() => setUiLang((prev) => (prev === "zh" ? "en" : "zh"))}
          >
            {uiLang === "zh" ? "EN" : "\u4e2d\u6587"}
          </Button>
          <Button asChild size="icon" className="h-9 w-9 rounded-full">
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
    <footer className="min-h-12 rounded-t-[22px] border border-b-0 border-border/50 bg-card/75 shadow-[0_-10px_32px_hsl(var(--shadow-hue)/0.05)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-12 max-w-[1180px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs font-medium text-muted-foreground">
        <a href="https://github.com/CodingFeng101/CanvasAnvil" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors duration-fast ease-out-soft hover:bg-accent hover:text-foreground">
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <span className="h-4 w-px bg-border" />
        <span className="flex items-center gap-2 rounded-full px-2.5 py-1.5">
          <Scale className="h-4 w-4" />
          {copy.footerLicense}
        </span>
        <span className="h-4 w-px bg-border" />
        <a href="mailto:fengguodong972@gmail.com" className="flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors duration-fast ease-out-soft hover:bg-accent hover:text-foreground">
          <Mail className="h-4 w-4" />
          {copy.footerContact}: fengguodong972@gmail.com
        </a>
      </div>
    </footer>
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
    // `min-h-full`, not `h-full overflow-hidden`: when the page fits it is
    // still centred in the viewport, and when it does not -- a window under
    // 1280px stacks the previews below the copy, and English runs a third
    // longer -- the scroll container around it takes over instead of the
    // bottom row of previews being cut off with no way to reach it.
    <section id={`portal-${canvas}`} className={cn("flex min-h-full items-center short:py-2", isEnglish ? "py-3" : "py-4")}>
      <div
        className={cn(
          "grid w-full rounded-[30px] border border-border/60 bg-card/40 shadow-soft backdrop-blur-sm xl:grid-cols-[0.78fr_1.22fr]",
          isEnglish ? "gap-6 p-6 2xl:gap-8 2xl:p-8" : "gap-7 p-7 2xl:gap-9 2xl:p-9",
          // Laptop-height windows: tighter rhythm so the page fits on one
          // screen instead of scrolling. Tall screens keep the airy version.
          "short:gap-5 short:p-5 short:2xl:gap-6 short:2xl:p-6",
        )}
      >
        <Stagger className="self-center" stagger={0.055}>
          <StaggerItem>
            <h1 className={cn("font-semibold text-foreground", isEnglish ? "text-[clamp(34px,3.5vw,50px)] leading-[1.05] short:text-[34px]" : "text-[clamp(40px,4.4vw,62px)] leading-[1.08] short:text-[40px]")}>{config.title}</h1>
          </StaggerItem>
          <StaggerItem>
            <h2 className={cn("font-semibold leading-tight text-primary-strong", isEnglish ? "mt-2 text-[clamp(18px,1.75vw,23px)] short:mt-1.5 short:text-[17px]" : "mt-2.5 text-[clamp(22px,2.2vw,30px)] short:mt-1.5 short:text-[20px]")}>{config.subtitle}</h2>
          </StaggerItem>
          <StaggerItem>
            <p className={cn("max-w-[620px] text-muted-foreground", isEnglish ? "mt-4 text-[clamp(15px,1.2vw,16px)] leading-7 short:mt-3 short:text-[14px] short:leading-6" : "mt-5 text-[17px] leading-8 short:mt-3 short:text-[15px] short:leading-7")}>{config.intro}</p>
          </StaggerItem>

          <StaggerItem className={cn("flex flex-wrap", isEnglish ? "mt-5 gap-2.5" : "mt-6 gap-3", "short:mt-3 short:gap-2")}>
            {config.tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-card font-medium leading-tight text-foreground/80 shadow-xs",
                  "transition-[transform,border-color,box-shadow] duration-base ease-out-soft hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-soft",
                  isEnglish ? "px-4 py-2.5 text-[14px]" : "px-4 py-2.5 text-[15px]",
                  "short:px-3 short:py-1.5 short:text-[13px]",
                )}
              >
                <Icon className="h-4 w-4 text-primary-strong" />
                <span className="whitespace-normal">{tag}</span>
              </span>
            ))}
          </StaggerItem>

          <StaggerItem className={cn(isEnglish ? "mt-5 space-y-2.5" : "mt-6 space-y-3", "short:mt-3 short:space-y-1.5")}>
            {config.bullets.map((bullet) => (
              <div key={bullet} className={cn("flex items-start gap-3 text-muted-foreground", isEnglish ? "text-[15px] leading-6" : "text-[16px] leading-7", "short:text-[14px] short:leading-6")}>
                <CheckCircle2 className="mt-1 h-[18px] w-[18px] shrink-0 text-primary-strong" />
                <span>{bullet}</span>
              </div>
            ))}
          </StaggerItem>

          <StaggerItem className={cn(isEnglish ? "mt-6" : "mt-7", "short:mt-4")}>
            <div className={cn("max-w-[540px] font-semibold text-primary-strong", isEnglish ? "mb-2 text-[16px] leading-6" : "mb-2.5 text-[19px] leading-7", "short:mb-2 short:text-[15px]")}>{config.slogan}</div>
            {/* The same primary button as the rest of the product. The old
                hand-drawn brush plate (and the brush cursor that went with it)
                was the one element on the site in a different visual voice. */}
            <motion.div {...pressable} className="inline-block">
              <Button
                size="lg"
                className={cn(
                  "group rounded-xl font-semibold shadow-soft",
                  isEnglish ? "h-12 px-7 text-[16px]" : "h-[52px] px-8 text-[17px]",
                  "short:h-11",
                )}
                onClick={() => onEnterWorkspace(canvas)}
              >
                {config.cta}
                <ArrowRight className="size-5 transition-transform duration-fast ease-out-soft group-hover:translate-x-1" />
              </Button>
            </motion.div>
          </StaggerItem>
        </Stagger>

        <Stagger className={cn("grid content-center md:grid-cols-2", isEnglish ? "gap-x-5 gap-y-3" : "gap-x-7 gap-y-5", "short:gap-y-3")} stagger={0.06} delay={0.12}>
          {config.previews.map((preview, index) => (
            <StaggerItem key={preview.title}>
              <div className={cn("pl-2 font-medium leading-tight text-foreground", isEnglish ? "mb-1.5 text-[15px]" : "mb-2 text-[16px]", "short:mb-1 short:text-[14px]")}>{preview.title}</div>
              <button
                className={cn(
                  "relative block w-full rounded-[18px] border border-border/70 bg-card text-left shadow-soft",
                  "transition-[transform,box-shadow] duration-base ease-out-soft hover:-translate-y-1 hover:shadow-soft-lg active:-translate-y-0.5",
                  isEnglish ? "p-3" : "p-4",
                  "short:p-2.5",
                )}
                onClick={() => onPreviewImage(preview)}
              >
                {/* Pin and tape — the board metaphor, warmed up. */}
                <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-primary shadow-soft" />
                <span className={cn("absolute -top-3 h-7 w-20 rotate-6 bg-primary/12", index % 2 === 0 ? "right-14" : "right-24")} />
                <span className="absolute right-3 top-3 h-8 w-8 rounded-bl-2xl border-b border-l border-border/60 bg-gradient-to-br from-transparent to-accent/60" />
                <span className="block overflow-hidden rounded-xl border border-border/50 bg-sunken">
                  <img src={preview.image} alt={preview.title} className={cn("w-full object-contain", isEnglish ? "h-[150px] 2xl:h-[168px]" : "h-[170px] 2xl:h-[204px]", "short:!h-[132px]")} />
                </span>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export function PortalPage({ onEnterWorkspace }: PortalPageProps) {
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getUiLanguage());
  const [activeCanvas, setActiveCanvas] = useState<PortalWorkspace>("diagram");
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

  /** The scroll container of the page on screen (not one still animating out). */
  const currentPageEl = () =>
    document.querySelector<HTMLElement>(`[data-portal-page="${activeSection}"]`);

  /** Whether the current page still has room to scroll that way, so the gesture belongs to it rather than to paging. */
  const canScrollPage = (direction: 1 | -1) => {
    const el = currentPageEl();
    if (!el) return false;
    return direction > 0
      ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
      : el.scrollTop > 1;
  };

  // The pages turned only on the wheel. Arrow keys and PageUp/PageDown now
  // do the same -- scrolling a tall page first, exactly like the wheel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (previewImage || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const step =
        event.key === "ArrowDown" || event.key === "PageDown" ? 1 : event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const el = currentPageEl();
      if (el && canScrollPage(step)) {
        const distance = event.key.startsWith("Page") ? el.clientHeight * 0.85 : 80;
        el.scrollBy({ top: step * distance, behavior: "smooth" });
        return;
      }
      turnPage(step);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
          "CanvasAnvil \u652f\u6301\u56db\u79cd\u753b\u5e03\uff1a\u56fe\u8868\u7ed8\u5236\u3001\u5ba4\u5185\u8bbe\u8ba1\u3001PPT \u6f14\u793a\u3001\u81ea\u7531\u753b\u5e03\u3002\u63d0\u4f9b\u7ed3\u6784\u5316\u751f\u6210\u4e0e\u672c\u5730\u5c40\u90e8\u4fee\u6539\u80fd\u529b\uff0c\u5e2e\u52a9\u4f60\u9ad8\u6548\u3001\u53ef\u63a7\u5730\u5b8c\u6210\u5404\u7c7b\u53ef\u89c6\u5316\u521b\u4f5c\u3002",
        tagA: "\u56db\u79cd\u753b\u5e03",
        tagB: "\u7ed3\u6784\u5316\u751f\u6210",
        tagC: "\u5c40\u90e8\u4fee\u6539",
        openRepo: "GitHub",
        footerLicense: "\u5f00\u6e90\u534f\u8bae\uff1aAGPL-3.0",
        footerContact: "\u8054\u7cfb\u65b9\u5f0f",
        hub: "CanvasAnvil",
        hubSub: "\u591a\u753b\u5e03\u5de5\u4f5c\u53f0",
        mobileHint: "\u70b9\u51fb\u5361\u7247\u8fdb\u5165\u5bf9\u5e94\u753b\u5e03",
        ctaPrimary: "\u5f00\u59cb\u521b\u4f5c",
        ctaSecondary: "\u4e86\u89e3\u5404\u4e2a\u753b\u5e03",
      }
    : {
        home: "Home",
        titleA: "The AI workbench",
        // The trailing space is the gap the old copy lost ("canvascreation");
        // the hyphen is non-breaking so "multi-canvas" never splits.
        titleB: "for ",
        titleAccent: "multi‑canvas creation",
        intro:
          "CanvasAnvil brings four canvases together: Diagram, Interior Design, PPT and Free Canvas. Get a first draft from one sentence, then revise just the part you want, fast and under your control.",
        tagA: "Four canvases",
        tagB: "Structured output",
        tagC: "Partial edits",
        openRepo: "GitHub",
        footerLicense: "License: AGPL-3.0",
        footerContact: "Contact",
        hub: "CanvasAnvil",
        hubSub: "Multi-canvas workspace",
        mobileHint: "Tap a card to enter its workspace",
        ctaPrimary: "Start creating",
        ctaSecondary: "Explore the canvases",
      };

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground font-sans">
      <style>{`
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
        @keyframes portal-glow-drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(40px, 24px, 0) scale(1.06); }
        }
        .portal-glow { animation: portal-glow-drift 18s var(--ease-in-out-soft) infinite; }
        .portal-glow-late { animation-delay: -9s; }
        @media (prefers-reduced-motion: reduce) {
          .portal-glow { animation: none; }
        }
      `}</style>

      {/* Ground layer. The old blueprint grid was the loudest thing on the
          page; this keeps the drafting-paper idea at roughly a third of the
          contrast so the content sits on top of it rather than inside it. */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground) / 0.035) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.035) 1px, transparent 1px), radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.05) 1px, transparent 0)",
            backgroundSize: "112px 112px, 112px 112px, 24px 24px",
          }}
        />
        <div className="absolute left-8 right-8 top-6 h-px bg-border/70" />
        <div className="absolute bottom-8 left-8 right-8 h-px bg-border/60" />
        <div className="absolute bottom-8 left-8 top-6 w-px bg-border/60" />
        <div className="absolute bottom-8 right-8 top-6 w-px bg-border/50" />
        {/* Two slow washes of the brand colour, drifting. They replaced a
            scatter of stray strokes -- a star, dashed arcs, a lone chevron --
            that read as leftovers rather than as decoration. */}
        <div className="portal-glow absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="portal-glow portal-glow-late absolute -bottom-48 right-[-10rem] h-[620px] w-[620px] rounded-full bg-accent/60 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/50 to-transparent" />
      </div>

      {/* Header, page, footer as one column: the page takes whatever height
          is left. It used to be a fixed `100vh - 160px` under a sticky header
          and above a fixed footer, which held only while the header stayed
          one row -- below 1280px it wraps to two and the page slid under
          the footer. */}
      <div
        className="relative flex h-screen flex-col overflow-hidden"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) < 18) return;
          const direction = event.deltaY > 0 ? 1 : -1;
          // A page taller than the window scrolls first; the wheel only turns
          // the page once that scroll has reached its end.
          if (canScrollPage(direction)) return;
          turnPage(direction);
        }}
      >
        <div className="relative z-40 mx-auto w-full max-w-[1500px] shrink-0 px-4 pt-4 sm:px-6 lg:px-10">
        <Header
          uiLang={uiLang}
          copy={copy}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          setActiveCanvas={setActiveCanvas}
          setUiLang={setUiLang}
        />
        </div>

        <div className="relative mx-auto min-h-0 w-full max-w-[1500px] flex-1 px-4 sm:px-6 lg:px-10">
          <AnimatePresence mode="sync">
            <motion.div
              key={activeSection}
              // Transform and opacity only. The previous version animated a 6px
              // blur across the whole page, which is the one property here that
              // forces a full-surface repaint every frame.
              initial={{ opacity: 0, y: 14, scale: 0.994 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.994 }}
              transition={TWEEN.slow}
              data-portal-page={activeSection}
              className="absolute inset-x-4 top-0 h-full overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-thin sm:inset-x-6 lg:inset-x-10"
            >
        {activeSection === "home" ? (
        <main id="portal-home" className="grid min-h-full items-center gap-8 py-2 xl:grid-cols-[0.88fr_1.12fr]">
          <section className="max-w-[650px] px-2">
            <Stagger stagger={0.07}>
              <StaggerItem>
                <h1 className={cn("font-semibold leading-[1.1] tracking-[-0.02em] text-foreground", uiLang === "zh" ? "text-[clamp(34px,4vw,58px)]" : "text-[clamp(32px,3.4vw,52px)]")}>
                  <span className="block">{copy.titleA}</span>
                  <span className="block">
                    <span>{copy.titleB}</span>
                    <span className="text-primary-strong">{copy.titleAccent}</span>
                  </span>
                </h1>
              </StaggerItem>
              <StaggerItem>
                <p className="mt-6 max-w-[620px] text-[clamp(15px,1.25vw,17px)] leading-8 text-muted-foreground">
                  {copy.intro}
                </p>
              </StaggerItem>
              <StaggerItem className="mt-6 flex flex-wrap gap-2">
                {[copy.tagA, copy.tagB, copy.tagC].map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1 text-[13px] font-medium text-foreground/75 shadow-xs backdrop-blur-sm"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {tag}
                  </span>
                ))}
              </StaggerItem>
              {/* The page used to have no way in from here but the nav or a
                  moving card on the orbit; the primary action now sits where
                  the eye lands after the headline. */}
              <StaggerItem className="mt-8 flex flex-wrap items-center gap-3">
                <motion.div {...pressable}>
                  <Button size="lg" className="group h-12 rounded-xl px-6 text-[15px] shadow-soft" onClick={() => onEnterWorkspace(activeCanvas)}>
                    {copy.ctaPrimary}
                    <ArrowRight className="transition-transform duration-fast ease-out-soft group-hover:translate-x-0.5" />
                  </Button>
                </motion.div>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl px-5 text-[15px]"
                  onClick={() => goToSection(activeCanvas)}
                >
                  {copy.ctaSecondary}
                </Button>
              </StaggerItem>
            </Stagger>
          </section>

          <section className="hidden justify-center xl:flex">
            <div
              className="relative h-[650px] w-[720px] short:[zoom:0.82]"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <div className="absolute left-[74px] top-2 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,hsl(var(--card))_0%,hsl(var(--card)/0.7)_45%,hsl(var(--accent)/0.35)_73%,transparent_100%)]" />
              <div className="absolute left-[238px] top-[172px] h-[280px] w-[280px] rotate-[-5deg] rounded-[28px] border border-border/60 bg-card/50 shadow-soft" />
              <div className="absolute left-[252px] top-[186px] h-[280px] w-[280px] rotate-[4deg] rounded-[28px] border border-border/50 bg-sunken/50 shadow-soft" />

              <svg viewBox="0 0 720 720" className="absolute left-[384px] top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2">
                <defs>
                  <marker id="orbit-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="hsl(var(--primary) / 0.7)" />
                  </marker>
                  <filter id="canvas-paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#3A2A20" floodOpacity="0.08" />
                  </filter>
                </defs>

                <rect x="258" y="258" width="204" height="204" rx="28" fill="hsl(var(--card) / 0.6)" stroke="hsl(var(--foreground) / 0.08)" filter="url(#canvas-paper-shadow)" />
                <path d="M286 314 H432 M286 360 H432 M286 406 H432" stroke="hsl(var(--foreground) / 0.07)" strokeWidth="2" strokeLinecap="round" />
                <path d="M314 286 V434 M360 286 V434 M406 286 V434" stroke="hsl(var(--foreground) / 0.05)" strokeWidth="2" strokeLinecap="round" />

                <circle cx="360" cy="360" r="250" fill="none" stroke="hsl(var(--primary) / 0.14)" strokeWidth="1.6" strokeDasharray="4 10" />
                <circle cx="360" cy="360" r="205" fill="none" stroke="hsl(var(--primary) / 0.16)" strokeWidth="2.2" />
                <circle cx="360" cy="360" r="160" fill="none" stroke="hsl(var(--primary) / 0.11)" strokeWidth="1.6" strokeDasharray="11 9" />
                <circle cx="360" cy="360" r="112" fill="none" stroke="hsl(var(--primary) / 0.17)" strokeWidth="2.6" />

                <path d="M232 190 A205 205 0 0 1 500 230" fill="none" stroke="hsl(var(--primary) / 0.6)" strokeWidth="2.3" markerEnd="url(#orbit-arrow)" />
                <path d="M525 456 A205 205 0 0 1 380 566" fill="none" stroke="hsl(var(--primary) / 0.48)" strokeWidth="2.2" markerEnd="url(#orbit-arrow)" />
                <path d="M190 462 A205 205 0 0 1 166 322" fill="none" stroke="hsl(var(--primary) / 0.4)" strokeWidth="2.1" markerEnd="url(#orbit-arrow)" />

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

              {/* Centring lives in motion's own x/y, not in `-translate-*`
                  classes: an animated `scale` writes an inline `transform` that
                  would clobber the utility and drop the hub off-centre. */}
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...SPRING.gentle, delay: 0.1 }}
                style={{ x: "-50%", y: "-50%" }}
                className="absolute left-[384px] top-1/2 h-[248px] w-[248px] rounded-full border border-primary/25 bg-card shadow-soft-lg"
              >
                <div className="absolute inset-4 rounded-full border border-border/70" style={{ animation: "portal-ring-breathe 5s ease-in-out infinite" }} />
                <div className="absolute inset-8 rounded-full bg-[radial-gradient(circle,hsl(var(--card))_0%,hsl(var(--sunken))_100%)] shadow-[inset_0_0_0_8px_hsl(var(--primary)/0.05),0_0_0_2px_hsl(var(--primary)/0.07)]" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <BrandIcon className="h-20 w-20" />
                  <div className="mt-3 text-2xl font-semibold text-foreground">{copy.hub}</div>
                  <div className="mt-1.5 text-sm text-muted-foreground">{copy.hubSub}</div>
                </div>
              </motion.div>
            </div>
          </section>

          <section className="xl:hidden">
            <div className="mb-3 text-sm font-medium text-primary-strong">{copy.mobileHint}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {portalCanvasItems.map((item) => (
                <button
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-card p-3 text-left shadow-soft transition-transform duration-base ease-out-soft active:scale-[0.99]"
                  onMouseEnter={() => setActiveCanvas(item.id)}
                  onFocus={() => setActiveCanvas(item.id)}
                  onClick={() => {
                    setActiveCanvas(item.id);
                    setActiveSection(item.id);
                    scrollToPortalSection(item.id);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{uiLang === "zh" ? item.zhTitle : item.enTitle}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.accent }} />
                  </div>
                  <img src={item.image} alt={uiLang === "zh" ? item.zhTitle : item.enTitle} className="h-[128px] w-full rounded-xl border border-border/60 object-cover object-top" />
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

        <div className="relative z-40 shrink-0 px-4 sm:px-6 lg:px-10">
          <Footer copy={copy} />
        </div>

        <AnimatePresence>
          {previewImage && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-8 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewImage(null)}
            >
              <motion.div
                className="relative max-h-[86vh] w-full max-w-[1180px] rounded-[28px] border border-border/60 bg-card p-5 shadow-soft-xl"
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.96 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="text-[22px] font-semibold text-foreground">{previewImage.title}</div>
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-sunken text-muted-foreground transition-[background-color,color,transform] duration-fast ease-out-soft hover:bg-accent hover:text-foreground active:scale-95"
                    onClick={() => setPreviewImage(null)}
                    aria-label={uiLang === "zh" ? "关闭预览" : "Close preview"}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex max-h-[72vh] items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-sunken">
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
