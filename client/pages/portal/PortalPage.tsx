import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  Share2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { getUiLanguage, setUiLanguage, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { SPRING, Stagger, StaggerItem, TWEEN, liftOnHover } from "@/shared/motion";
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
  flow: Blocks,
  cad: Home,
  ppt: Presentation,
};

const detailConfigs: Record<PortalWorkspace, DetailConfig> = {
  flow: {
    title: "\u56fe\u6807\u753b\u5e03",
    subtitle: "\u4e00\u53e5\u9700\u6c42\uff0c\u5feb\u901f\u751f\u6210\u7ed3\u6784\u5316\u56fe\u6807",
    intro: "\u56fe\u6807\u753b\u5e03\u8ba9\u4f60\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u6d41\u7a0b\uff0c\u81ea\u52a8\u751f\u6210\u53ef\u7f16\u8f91\u7684\u56fe\u6807\u3002\u652f\u6301\u8282\u70b9\u4e0e\u8fde\u7ebf\u7f16\u8f91\u3001\u5c40\u90e8\u4fee\u6539\uff0c\u5e76\u53ef\u5bfc\u51fa draw.io XML\u3002",
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
      { title: "\u751f\u6210 XML", text: "\u8f6c\u6362\u4e3a draw.io \u517c\u5bb9\u7684\u56fe\u6807\u6570\u636e\u3002", icon: Code2 },
      { title: "\u9884\u89c8\u4e0e\u6821\u9a8c", text: "\u68c0\u67e5\u8282\u70b9\u4e0e\u8fde\u7ebf\u662f\u5426\u7b26\u5408\u9884\u671f\u3002", icon: ChartNoAxesCombined },
      { title: "\u5c40\u90e8\u4fee\u6539", text: "\u5bf9\u8282\u70b9\u6216\u8fde\u7ebf\u8fdb\u884c\u7cbe\u7ec6\u8c03\u6574\u3002", icon: Pencil },
      { title: "\u5bfc\u51fa\u590d\u7528", text: "\u5bfc\u51fa draw.io XML\uff0c\u7528\u4e8e\u534f\u4f5c\u4e0e\u590d\u7528\u3002", icon: Upload },
    ],
    cta: "\u5f00\u59cb\u7ed8\u5236",
    slogan: "\u8ba9\u56fe\u6807\u50cf\u753b\u5e03\u4e00\u6837\u81ea\u7531\u521b\u4f5c",
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
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[220px_minmax(0,1fr)_132px] xl:items-center">
        <button
          className="group flex items-center gap-3 text-left"
          onClick={() => {
            setActiveSection("home");
            setActiveCanvas("flow");
            scrollToPortalSection("home");
          }}
        >
          <BrandIcon className="h-9 w-9 transition-transform duration-base ease-out-soft group-hover:-rotate-6" />
          <span className="font-display text-[21px] font-semibold tracking-[-0.015em] text-foreground">CanvasAnvil</span>
        </button>

        <nav className="overflow-x-auto">
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

        <div className="flex justify-end gap-2">
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
    <section id={`portal-${canvas}`} className={cn("flex h-full items-center overflow-hidden", isEnglish ? "py-3" : "py-4")}>
      <div
        className={cn(
          "grid w-full rounded-[30px] border border-border/60 bg-card/40 shadow-soft backdrop-blur-sm xl:grid-cols-[0.78fr_1.22fr]",
          isEnglish ? "gap-6 p-6 2xl:gap-8 2xl:p-8" : "gap-7 p-7 2xl:gap-9 2xl:p-9",
        )}
      >
        <Stagger className="self-center" stagger={0.055}>
          <StaggerItem>
            <h1 className={cn("font-semibold text-foreground", isEnglish ? "text-[clamp(34px,3.5vw,50px)] leading-[1.05]" : "text-[clamp(40px,4.4vw,62px)] leading-[1.08]")}>{config.title}</h1>
          </StaggerItem>
          <StaggerItem>
            <h2 className={cn("font-semibold leading-tight text-primary-strong", isEnglish ? "mt-2 text-[clamp(18px,1.75vw,23px)]" : "mt-2.5 text-[clamp(22px,2.2vw,30px)]")}>{config.subtitle}</h2>
          </StaggerItem>
          <StaggerItem>
            <p className={cn("max-w-[620px] text-muted-foreground", isEnglish ? "mt-4 text-[clamp(15px,1.2vw,16px)] leading-7" : "mt-5 text-[17px] leading-8")}>{config.intro}</p>
          </StaggerItem>

          <StaggerItem className={cn("flex flex-wrap", isEnglish ? "mt-5 gap-2.5" : "mt-6 gap-3")}>
            {config.tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-card font-medium leading-tight text-foreground/80 shadow-xs",
                  "transition-[transform,border-color,box-shadow] duration-base ease-out-soft hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-soft",
                  isEnglish ? "px-4 py-2.5 text-[14px]" : "px-4 py-2.5 text-[15px]",
                )}
              >
                <Icon className="h-4 w-4 text-primary-strong" />
                <span className="whitespace-normal">{tag}</span>
              </span>
            ))}
          </StaggerItem>

          <StaggerItem className={cn(isEnglish ? "mt-5 space-y-2.5" : "mt-6 space-y-3")}>
            {config.bullets.map((bullet) => (
              <div key={bullet} className={cn("flex items-start gap-3 text-muted-foreground", isEnglish ? "text-[15px] leading-6" : "text-[16px] leading-7")}>
                <CheckCircle2 className="mt-1 h-[18px] w-[18px] shrink-0 text-primary-strong" />
                <span>{bullet}</span>
              </div>
            ))}
          </StaggerItem>

          <StaggerItem className={cn(isEnglish ? "mt-6" : "mt-7")}>
            <div className={cn("max-w-[540px] font-semibold text-primary-strong", isEnglish ? "mb-2 text-[16px] leading-6" : "mb-2.5 text-[19px] leading-7")}>{config.slogan}</div>
            {/* The brush-stroke plate stays — a hand-made mark suits the brand.
                Only the palette moves from blueprint blue to clay. */}
            <button
              className={cn(
                "group relative max-w-full overflow-visible px-12 font-semibold tracking-[0.04em] text-primary-foreground",
                "transition-transform duration-base ease-out-soft hover:-translate-y-1 active:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                isEnglish ? "h-[60px] min-w-[320px] text-[clamp(18px,1.85vw,22px)]" : "h-[66px] min-w-[350px] text-[clamp(23px,2.3vw,29px)]",
              )}
              onClick={() => onEnterWorkspace(canvas)}
            >
              <svg viewBox="0 0 380 84" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_14px_26px_rgba(122,53,32,0.22)] transition-transform duration-base ease-out-soft group-hover:scale-[1.03]" aria-hidden="true">
                <path d="M12 44 C42 17 96 19 150 26 C203 33 244 17 300 23 C342 27 370 39 374 48 C346 65 294 62 241 65 C181 69 127 73 72 64 C34 58 17 51 12 44Z" fill="#A0472A" />
                <path d="M32 47 C86 31 142 37 191 36 C250 34 304 31 356 46 C307 59 250 57 192 62 C130 67 71 60 32 47Z" fill="#C96442" />
                <path d="M50 31 C105 21 161 29 211 26 C260 23 302 22 342 32" fill="none" stroke="#F5D3C4" strokeWidth="5" strokeLinecap="round" opacity="0.62" />
                <path d="M7 46 C26 52 41 59 56 72" fill="none" stroke="#B4522F" strokeWidth="3.6" strokeLinecap="round" opacity="0.6" />
                <path d="M331 64 C350 60 367 55 379 47" fill="none" stroke="#EFB8A2" strokeWidth="3.6" strokeLinecap="round" opacity="0.72" />
              </svg>
              <span className="relative z-10 drop-shadow-[0_1px_3px_rgba(90,38,22,0.4)]">{config.cta}</span>
            </button>
          </StaggerItem>
        </Stagger>

        <Stagger className={cn("grid content-center md:grid-cols-2", isEnglish ? "gap-x-5 gap-y-3" : "gap-x-7 gap-y-5")} stagger={0.06} delay={0.12}>
          {config.previews.map((preview, index) => (
            <StaggerItem key={preview.title}>
              <div className={cn("pl-2 font-medium leading-tight text-foreground", isEnglish ? "mb-1.5 text-[15px]" : "mb-2 text-[16px]")}>{preview.title}</div>
              <button
                className={cn(
                  "relative block w-full rounded-[18px] border border-border/70 bg-card text-left shadow-soft",
                  "transition-[transform,box-shadow] duration-base ease-out-soft hover:-translate-y-1 hover:shadow-soft-lg active:-translate-y-0.5",
                  isEnglish ? "p-3" : "p-4",
                )}
                onClick={() => onPreviewImage(preview)}
              >
                {/* Pin and tape — the board metaphor, warmed up. */}
                <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-primary shadow-soft" />
                <span className={cn("absolute -top-3 h-7 w-20 rotate-6 bg-primary/12", index % 2 === 0 ? "right-14" : "right-24")} />
                <span className="absolute right-3 top-3 h-8 w-8 rounded-bl-2xl border-b border-l border-border/60 bg-gradient-to-br from-transparent to-accent/60" />
                <span className="block overflow-hidden rounded-xl border border-border/50 bg-sunken">
                  <img src={preview.image} alt={preview.title} className={cn("w-full object-contain", isEnglish ? "h-[150px] 2xl:h-[168px]" : "h-[170px] 2xl:h-[204px]")} />
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
          "CanvasAnvil \u652f\u6301\u4e09\u79cd\u753b\u5e03\uff1a\u56fe\u6807\u753b\u5e03\u3001\u5ba4\u5185\u8bbe\u8ba1\u753b\u5e03\u3001PPT\u753b\u5e03\u3002\u63d0\u4f9b\u7ed3\u6784\u5316\u751f\u6210\u4e0e\u672c\u5730\u5c40\u90e8\u4fee\u6539\u80fd\u529b\uff0c\u5e2e\u52a9\u4f60\u9ad8\u6548\u3001\u53ef\u63a7\u5730\u5b8c\u6210\u5404\u7c7b\u53ef\u89c6\u5316\u521b\u4f5c\u3002",
        tagA: "\u4e09\u79cd\u753b\u5e03",
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
          "CanvasAnvil supports three canvases: flow, interior, and PPT. It combines structured generation with local Patch / Replace editing so visual creation stays fast and controllable.",
        tagA: "Three Canvases",
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
    <div className="h-screen overflow-hidden bg-background text-foreground font-sans" style={{ cursor: brushCursor }}>
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
        <div className="absolute left-16 top-[170px] h-28 w-80 -rotate-12 rounded-full border-t-[18px] border-primary/[0.07]" />
        <div className="absolute bottom-16 left-20 h-20 w-64 rotate-[-18deg] border-b-2 border-l-2 border-primary/10" />
        <div className="absolute right-20 top-36 h-20 w-64 rotate-[-8deg] border-t-2 border-primary/10" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1500 980" preserveAspectRatio="none">
          <path d="M44 861 C151 783 224 766 305 690" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeOpacity="0.14" strokeDasharray="8 12" />
          <path d="M1240 146 C1300 134 1360 142 1416 118" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeOpacity="0.12" />
          <path d="M80 150 h62 v62 h-62z" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeOpacity="0.1" strokeDasharray="6 8" />
          <path d="M1426 706 l-16 28 -16 -28" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeOpacity="0.14" />
          <path d="M556 308 l14 23 23 14 -23 14 -14 23 -14 -23 -23 -14 23 -14 14 -23z" fill="hsl(var(--primary))" fillOpacity="0.13" />
        </svg>
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/50 to-transparent" />
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
              // Transform and opacity only. The previous version animated a 6px
              // blur across the whole page, which is the one property here that
              // forces a full-surface repaint every frame.
              initial={{ opacity: 0, y: 14, scale: 0.994 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.994 }}
              transition={TWEEN.slow}
              className="absolute inset-x-4 top-0 h-full sm:inset-x-6 lg:inset-x-10"
            >
        {activeSection === "home" ? (
        <main id="portal-home" className="grid h-full items-center gap-8 py-2 xl:grid-cols-[0.88fr_1.12fr]">
          <section className="max-w-[650px] px-2">
            <Stagger stagger={0.07}>
              <StaggerItem>
                <h1 className="text-[clamp(34px,4vw,58px)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
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
              {/* The rule draws itself in rather than fading — a small nod to
                  the drafting metaphor, and it costs one transform. */}
              <motion.div
                variants={{
                  hidden: { scaleX: 0 },
                  shown: { scaleX: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="mt-8 h-px w-64 origin-left bg-gradient-to-r from-primary/60 via-primary/25 to-transparent"
              />
            </Stagger>
          </section>

          <section className="hidden justify-center xl:flex">
            <div
              className="relative h-[650px] w-[720px]"
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

        <div className="fixed inset-x-0 bottom-0 z-40 px-4 sm:px-6 lg:px-10">
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
