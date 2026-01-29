import React, { useState } from 'react';
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from 'framer-motion';
import { Layers, Zap, Layout, Box, Droplet, Brush, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPdfDocumentFromUrl, renderPdfPageToCanvas } from '@/lib/pdf-utils';

interface LandingPageProps {
    onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
    const [activeShowcase, setActiveShowcase] = useState<'flow' | 'cad' | 'ppt'>('flow');

    return (
        <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-purple-500/30 relative overflow-hidden">
            {/* Load Artistic Font */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap');
                .font-artistic {
                    font-family: 'Ma Shan Zheng', cursive;
                }
                @keyframes hue-rotate-text {
                    0% { color: #60a5fa; }
                    25% { color: #a78bfa; }
                    50% { color: #22d3ee; }
                    75% { color: #818cf8; }
                    100% { color: #60a5fa; }
                }
                .animate-color-cycle {
                    animation: hue-rotate-text 5s infinite linear;
                }
            `}</style>

            {/* Dynamic Magic Background */}
            <div className="fixed inset-0 z-0">
                {/* Video Background */}
                <div className="absolute inset-0">
                    <video
                        className="w-full h-full object-cover"
                        src="/videos/maliang-draw.mp4"
                        autoPlay
                        loop
                        muted
                        playsInline
                    />
                    {/* Gradient Overlay for Readability */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(10,10,20,0.35),rgba(0,0,0,0.65))]" />
                    <div className="absolute inset-0 bg-black/20" />
                </div>
                
                {/* Ambient Light Orbs */}
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.2, 0.4, 0.2],
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[-20%] left-[20%] w-[40vw] h-[40vw] bg-blue-900/20 rounded-full blur-[120px]"
                />
                 <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.1, 0.3, 0.1],
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-[-10%] right-[10%] w-[50vw] h-[50vw] bg-purple-900/20 rounded-full blur-[120px]"
                />

                {/* Floating Particles */}
                {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute rounded-full bg-blue-400/30 blur-[1px]"
                        initial={{
                            x: Math.random() * window.innerWidth,
                            y: Math.random() * window.innerHeight,
                            opacity: 0,
                        }}
                        animate={{
                            y: [null, Math.random() * -100],
                            opacity: [0, Math.random() * 0.5 + 0.2, 0],
                        }}
                        transition={{
                            duration: Math.random() * 10 + 10,
                            repeat: Infinity,
                            ease: "linear",
                            delay: Math.random() * 10,
                        }}
                        style={{
                            width: Math.random() * 4 + 1,
                            height: Math.random() * 4 + 1,
                        }}
                    />
                ))}
            </div>

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col">
                <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="max-w-4xl space-y-8"
                    >
                         <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-light tracking-wide text-blue-200/80 mb-6 font-artistic">
                            <Zap className="w-3.5 h-3.5" />
                            <span>AI 驱动的数字神笔</span>
                        </div>

                        <h1 className="text-6xl md:text-8xl font-bold tracking-tight leading-tight font-artistic">
                            <span className="block animate-color-cycle drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]">所想即所见</span>
                            <span className="block animate-color-cycle drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]" style={{ animationDelay: '-2.5s' }}>
                                一语定乾坤
                            </span>
                        </h1>

                        <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto font-light leading-relaxed font-artistic">
                            无需繁琐操作，AI 赋予你“神笔马良”般的能力。
                            <br/>
                            从逻辑图表到可交付成果，只在弹指之间。
                        </p>

                        <div className="pt-8">
                            <Button 
                                size="lg" 
                                onClick={onStart} 
                                className="h-16 px-12 rounded-full text-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)] transition-all hover:scale-105 border-0 font-artistic tracking-widest gap-3"
                            >
                                <Brush className="w-6 h-6" />
                                挥毫泼墨 
                                <Droplet className="w-6 h-6 fill-current" />
                            </Button>
                        </div>
                    </motion.div>

                    <div className="w-full mt-28 px-4 mb-20">
                        <div className="mx-auto w-full max-w-6xl">
                            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 items-stretch">
                                <div className="h-[74vh] flex flex-col gap-3">
                                    <button
                                        className={`flex-1 w-full text-left rounded-2xl border p-4 transition-colors shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
                                                activeShowcase === 'flow'
                                                    ? "border-blue-400/60 bg-white/14 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-blue-400/40"
                                                    : "border-white/18 bg-white/10 backdrop-blur-2xl backdrop-saturate-150 hover:bg-white/14"
                                        }`}
                                        onClick={() => setActiveShowcase('flow')}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-black/15 border border-white/14 backdrop-blur-xl flex items-center justify-center">
                                                <Layers className="w-5 h-5 text-blue-300" />
                                            </div>
                                            <div>
                                                <div className="text-white/90 font-semibold">智绘流程蓝图</div>
                                                <div className="text-white/45 text-sm mt-0.5">输入需求 → 生成并迭代流程图</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm text-white/60 space-y-1">
                                            <div>· 原子级修改：仅改不满意处，保留满意部分</div>
                                        </div>
                                    </button>

                                    <button
                                        className={`flex-1 w-full text-left rounded-2xl border p-4 transition-colors shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
                                                activeShowcase === 'cad'
                                                    ? "border-purple-400/60 bg-white/14 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-purple-400/40"
                                                    : "border-white/18 bg-white/10 backdrop-blur-2xl backdrop-saturate-150 hover:bg-white/14"
                                        }`}
                                        onClick={() => setActiveShowcase('cad')}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-black/15 border border-white/14 backdrop-blur-xl flex items-center justify-center">
                                                <Box className="w-5 h-5 text-purple-300" />
                                            </div>
                                            <div>
                                                <div className="text-white/90 font-semibold">智能室内设计</div>
                                                <div className="text-white/45 text-sm mt-0.5">输入需求 → 2D 平面 → 装修图 / 物料清单</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm text-white/55 space-y-1">
                                            <div>· 全流程覆盖：需求→方案→2D→出图/清单</div>
                                            <div>· 2D 支持原子修改</div>
                                        </div>
                                    </button>

                                    <button
                                        className={`flex-1 w-full text-left rounded-2xl border p-4 transition-colors shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
                                                activeShowcase === 'ppt'
                                                    ? "border-cyan-300/70 bg-white/14 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-cyan-300/45"
                                                    : "border-white/18 bg-white/10 backdrop-blur-2xl backdrop-saturate-150 hover:bg-white/14"
                                        }`}
                                        onClick={() => setActiveShowcase('ppt')}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-black/15 border border-white/14 backdrop-blur-xl flex items-center justify-center">
                                                <Layout className="w-5 h-5 text-cyan-300" />
                                            </div>
                                            <div>
                                                <div className="text-white/90 font-semibold">智创演示文稿</div>
                                                <div className="text-white/45 text-sm mt-0.5">文案 → 结构 → 幻灯片</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm text-white/60 space-y-1">
                                            <div>· 单页/多页修改：支持精修与批量统一调整</div>
                                        </div>
                                    </button>
                                </div>

                                <div className="h-[74vh] rounded-3xl border border-white/18 bg-white/10 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden relative">
                                    <div className="absolute inset-0 pointer-events-none shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-1px_0_rgba(0,0,0,0.25)]" />
                                    <div className="absolute top-0 left-0 right-0 h-12 bg-white/10 border-b border-white/16 backdrop-blur-2xl flex items-center px-6 gap-2 z-20">
                                        <div className="flex gap-2">
                                            <div className="w-3.5 h-3.5 rounded-full bg-red-500/50" />
                                            <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/50" />
                                            <div className="w-3.5 h-3.5 rounded-full bg-green-500/50" />
                                        </div>
                                        <div className="ml-6 text-xs text-white/30 font-mono flex-1 text-center">Nexus AI Studio</div>
                                    </div>

                                    <div className="absolute inset-0 top-12 flex items-center justify-center">
                                        <AnimatePresence mode="wait">
                                            {activeShowcase === 'flow' && <DemoFlowchart key="flow" />}
                                            {activeShowcase === 'cad' && <DemoCAD key="cad" />}
                                            {activeShowcase === 'ppt' && <DemoPPT key="ppt" />}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="py-8 text-center text-xs text-gray-600">
                    <p>© 2026 Nexus AI Inc. 以 AI 绘未来。</p>
                </footer>
            </div>
        </div>
    );
}

// --- Demo Components ---

import { User, MessageSquare } from 'lucide-react';

function UserPrompt({ text, color = "blue" }: { text: string, color?: string }) {
    const colors = {
        blue: "bg-blue-600",
        purple: "bg-purple-600",
        green: "bg-green-600",
        cyan: "bg-cyan-600"
    }[color] || "bg-blue-600";

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-end gap-4 max-w-2xl z-50"
        >
            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center border border-white/10 shadow-lg shrink-0">
                <User className="w-6 h-6 text-zinc-300" />
            </div>
            <div className="relative">
                <div className={`px-6 py-4 rounded-2xl rounded-bl-none ${colors} text-white shadow-xl border border-white/10`}>
                    <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 opacity-70" />
                        <span className="text-lg font-medium tracking-wide"><Typewriter text={text} speed={30} /></span>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function DemoFlowchart() {
    const [step, setStep] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);

    // Sequence controller
    React.useEffect(() => {
        const timeouts: NodeJS.Timeout[] = [];
        
        const runSequence = () => {
            setStep(0);
            setIsGenerating(false);
            timeouts.push(setTimeout(() => setIsGenerating(true), 2200));
            timeouts.push(setTimeout(() => { setIsGenerating(false); setStep(1); }, 4200));
            timeouts.push(setTimeout(() => setStep(2), 6200));
            timeouts.push(setTimeout(() => setStep(3), 8200));
            timeouts.push(setTimeout(() => runSequence(), 16000));
        };

        runSequence();
        return () => timeouts.forEach(clearTimeout);
    }, []);

    return (
        <div className="w-full h-full bg-[#0f172a] relative overflow-hidden flex flex-col items-center justify-center p-4">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(30,41,59,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.3)_1px,transparent_1px)] bg-[size:20px_20px]" />
            
            {/* User Prompt Overlay (Step 0 Only) */}
            <AnimatePresence mode="wait">
                {step === 0 && !isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-50">
                        <UserPrompt text="帮我梳理 GraphRAG 的论文逻辑，生成流程图" color="blue" />
                    </div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {isGenerating && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-40"
                    >
                        <motion.div
                            initial={{ y: 8, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -8, opacity: 0 }}
                            className="rounded-2xl border border-blue-400/25 bg-white/10 backdrop-blur-2xl px-7 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                        >
                            <div className="text-white/85 font-semibold flex items-center gap-2">
                                <Layers className="w-4 h-4 text-blue-200" />
                                开始生成流程图…
                            </div>
                            <div className="text-white/45 text-sm mt-1">解析论文结构 · 抽取模块 · 组织链路</div>
                            <div className="mt-4 h-1.5 w-64 rounded-full bg-white/10 overflow-hidden">
                                <motion.div 
                                    className="h-full bg-blue-400/80" 
                                    animate={{ width: ["0%", "100%"] }} 
                                    transition={{ duration: 2.0, ease: "easeInOut" }} 
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Architecture - Visible Step >= 1 */}
            {step >= 1 && (
                <div className="relative w-full h-full flex flex-col">
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end items-center mb-2 px-8 border-b border-slate-800 pb-2"
                    >
                        <div className="flex gap-8 text-sm font-mono">
                            <span className={`flex items-center gap-2 ${step >= 1 ? "text-blue-400" : "text-slate-600"}`}>
                                <div className={`w-3 h-3 rounded-full ${step >= 1 ? "bg-blue-500 animate-pulse" : "bg-slate-600"}`}/> 索引构建引擎
                            </span>
                            <span className={`flex items-center gap-2 ${step >= 2 ? "text-purple-400" : "text-slate-600"}`}>
                                <div className={`w-3 h-3 rounded-full ${step >= 2 ? "bg-purple-500 animate-pulse" : "bg-slate-600"}`}/> 社区发现探测器
                            </span>
                            <span className={`flex items-center gap-2 ${step >= 3 ? "text-emerald-400" : "text-slate-600"}`}>
                                <div className={`w-3 h-3 rounded-full ${step >= 3 ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`}/> 全局检索链路
                            </span>
                        </div>
                    </motion.div>

                    <div className="flex-1 relative overflow-hidden border border-slate-800 bg-slate-900/50 rounded-xl backdrop-blur-sm">
                        <svg viewBox="0 0 1920 1080" className="w-full h-full">
                            <defs>
                                <marker id="arrow-blue" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
                                    <path d="M0,0 L0,12 L12,6 z" fill="#3b82f6" />
                                </marker>
                                <marker id="arrow-purple" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
                                    <path d="M0,0 L0,12 L12,6 z" fill="#a855f7" />
                                </marker>
                                <marker id="arrow-emerald" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
                                    <path d="M0,0 L0,12 L12,6 z" fill="#10b981" />
                                </marker>
                                <filter id="glow-strong">
                                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                                    <feMerge>
                                        <feMergeNode in="coloredBlur"/>
                                        <feMergeNode in="SourceGraphic"/>
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* --- ZONE 1: INDEXING (Left) --- */}
                            {step >= 1 && (
                                <g transform="translate(50, 80)">
                                <motion.g initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
                                    <text x="0" y="-40" fill="#3b82f6" fontSize="42" fontWeight="bold" letterSpacing="4">第一阶段：索引构建</text>
                                    <rect x="0" y="0" width="550" height="920" rx="20" fill="none" stroke="#3b82f6" strokeOpacity="0.3" strokeDasharray="8 8" strokeWidth="3" />
                                    
                                    {/* Source Docs */}
                                    <g transform="translate(50, 60)">
                                        <rect width="120" height="140" rx="10" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                                        <text x="60" y="80" textAnchor="middle" fill="#94a3b8" fontSize="24" fontWeight="bold">源文档</text>
                                    </g>
                                    
                                    {/* Text Chunks */}
                                    <g transform="translate(250, 60)">
                                        <rect width="120" height="140" rx="10" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                                        <text x="60" y="80" textAnchor="middle" fill="#94a3b8" fontSize="24" fontWeight="bold">文本切片</text>
                                        <line x1="20" y1="35" x2="100" y2="35" stroke="#334155" strokeWidth="3" />
                                        <line x1="20" y1="60" x2="100" y2="60" stroke="#334155" strokeWidth="3" />
                                        <line x1="20" y1="105" x2="100" y2="105" stroke="#334155" strokeWidth="3" />
                                    </g>
                                    
                                    {/* LLM Extraction */}
                                    <g transform="translate(50, 260)">
                                        <rect width="450" height="180" rx="10" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                                        <text x="30" y="45" fill="#3b82f6" fontSize="28" fontWeight="bold">LLM 信息提取</text>
                                        
                                        <g transform="translate(30, 70)">
                                            <rect width="110" height="80" rx="6" fill="#0f172a" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth="2" />
                                            <text x="55" y="50" textAnchor="middle" fill="#cbd5e1" fontSize="20">实体</text>
                                        </g>
                                        <g transform="translate(170, 70)">
                                            <rect width="110" height="80" rx="6" fill="#0f172a" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth="2" />
                                            <text x="55" y="50" textAnchor="middle" fill="#cbd5e1" fontSize="20">关系</text>
                                        </g>
                                        <g transform="translate(310, 70)">
                                            <rect width="110" height="80" rx="6" fill="#0f172a" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth="2" />
                                            <text x="55" y="50" textAnchor="middle" fill="#cbd5e1" fontSize="20">协变量</text>
                                        </g>
                                    </g>

                                    {/* Element Summaries */}
                                    <g transform="translate(50, 500)">
                                        <rect width="450" height="100" rx="10" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                                        <text x="225" y="60" textAnchor="middle" fill="#94a3b8" fontSize="28" fontWeight="bold">元素摘要生成</text>
                                    </g>

                                    {/* Graph Construction */}
                                    <g transform="translate(50, 660)">
                                        <rect width="450" height="140" rx="10" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                                        <text x="30" y="45" fill="#3b82f6" fontSize="28" fontWeight="bold">图谱拓扑构建</text>
                                        <circle cx="225" cy="80" r="40" fill="none" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth="3" />
                                        <circle cx="180" cy="70" r="8" fill="#3b82f6" />
                                        <circle cx="270" cy="70" r="8" fill="#3b82f6" />
                                        <circle cx="225" cy="110" r="8" fill="#3b82f6" />
                                        <path d="M180 70 L225 110 L270 70" stroke="#3b82f6" strokeOpacity="0.5" strokeWidth="3" />
                                    </g>

                                    {/* Connections */}
                                    <path d="M170 130 L250 130" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrow-blue)" />
                                    <path d="M310 200 L310 260" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrow-blue)" />
                                    <path d="M275 440 L275 500" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrow-blue)" />
                                    <path d="M275 600 L275 660" stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrow-blue)" />
                                </motion.g>
                                </g>
                            )}

                            {/* --- ZONE 2: HIERARCHICAL CLUSTERING (Center) --- */}
                            {step >= 2 && (
                                <g transform="translate(680, 80)">
                                <motion.g initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
                                    <text x="0" y="-40" fill="#a855f7" fontSize="42" fontWeight="bold" letterSpacing="4">第二阶段：层级聚类</text>
                                    <rect x="0" y="0" width="550" height="920" rx="20" fill="none" stroke="#a855f7" strokeOpacity="0.3" strokeDasharray="8 8" strokeWidth="3" />

                                    {/* Leiden Algorithm Box */}
                                    <g transform="translate(50, 60)">
                                        <rect width="450" height="100" rx="10" fill="#1e293b" stroke="#a855f7" strokeWidth="3" />
                                        <text x="225" y="60" textAnchor="middle" fill="#e9d5ff" fontSize="28" fontWeight="bold">Leiden 社区发现</text>
                                    </g>

                                    {/* Hierarchy Tree */}
                                    <g transform="translate(225, 240)">
                                        {/* Level 0 */}
                                        <circle cx="0" cy="0" r="35" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        <text x="0" y="8" textAnchor="middle" fill="#e9d5ff" fontSize="20" fontWeight="bold">L0</text>
                                        
                                        {/* Level 1 */}
                                        <circle cx="-120" cy="140" r="30" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        <circle cx="120" cy="140" r="30" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        <text x="-120" y="148" textAnchor="middle" fill="#e9d5ff" fontSize="20">L1</text>
                                        <text x="120" y="148" textAnchor="middle" fill="#e9d5ff" fontSize="20">L1</text>
                                        
                                        {/* Level 2 */}
                                        <circle cx="-180" cy="280" r="25" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        <circle cx="-60" cy="280" r="25" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        <circle cx="60" cy="280" r="25" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        <circle cx="180" cy="280" r="25" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
                                        
                                        {/* Tree Connections */}
                                        <path d="M0 35 L-120 110" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="3" />
                                        <path d="M0 35 L120 110" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="3" />
                                        <path d="M-120 170 L-180 255" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="3" />
                                        <path d="M-120 170 L-60 255" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="3" />
                                        <path d="M120 170 L60 255" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="3" />
                                        <path d="M120 170 L180 255" stroke="#a855f7" strokeOpacity="0.5" strokeWidth="3" />
                                    </g>

                                    {/* Community Summaries */}
                                    <g transform="translate(50, 660)">
                                        <rect width="450" height="200" rx="10" fill="#1e293b" stroke="#a855f7" strokeWidth="3" />
                                        <text x="30" y="45" fill="#a855f7" fontSize="28" fontWeight="bold">社区摘要生成</text>
                                        
                                        <rect x="30" y="70" width="390" height="35" rx="6" fill="#0f172a" stroke="#a855f7" strokeOpacity="0.3" />
                                        <text x="225" y="95" textAnchor="middle" fill="#a855f7" fontSize="20" opacity="0.9">摘要：根社区 0 (Root)</text>
                                        
                                        <rect x="30" y="115" width="390" height="35" rx="6" fill="#0f172a" stroke="#a855f7" strokeOpacity="0.3" />
                                        <text x="225" y="140" textAnchor="middle" fill="#a855f7" fontSize="20" opacity="0.9">摘要：子社区 1.1 (Topic A)</text>
                                        
                                        <rect x="30" y="160" width="390" height="35" rx="6" fill="#0f172a" stroke="#a855f7" strokeOpacity="0.3" />
                                        <text x="225" y="185" textAnchor="middle" fill="#a855f7" fontSize="20" opacity="0.9">摘要：子社区 1.2 (Topic B)</text>
                                    </g>

                                    {/* Incoming Link */}
                                    <path d="M-80 730 L 50 730" stroke="#a855f7" strokeDasharray="10 10" strokeWidth="3" markerEnd="url(#arrow-purple)" />
                                    <path d="M 275 160 L 275 210" stroke="#a855f7" strokeWidth="3" markerEnd="url(#arrow-purple)" />
                                </motion.g>
                                </g>
                            )}

                            {/* --- ZONE 3: GLOBAL SEARCH (Right) --- */}
                            {step >= 3 && (
                                <g transform="translate(1310, 80)">
                                <motion.g initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
                                    <text x="0" y="-40" fill="#10b981" fontSize="42" fontWeight="bold" letterSpacing="4">第三阶段：全局检索</text>
                                    <rect x="0" y="0" width="550" height="920" rx="20" fill="none" stroke="#10b981" strokeOpacity="0.3" strokeDasharray="8 8" strokeWidth="3" />

                                    {/* User Query */}
                                    <g transform="translate(50, 60)">
                                        <rect width="450" height="80" rx="40" fill="#064e3b" stroke="#10b981" strokeWidth="3" />
                                        <text x="225" y="50" textAnchor="middle" fill="#d1fae5" fontSize="28" fontWeight="bold">用户指令 (Query)</text>
                                    </g>

                                    {/* Map (Shuffle) */}
                                    <g transform="translate(50, 200)">
                                        <rect width="450" height="180" rx="10" fill="#1e293b" stroke="#10b981" strokeWidth="3" />
                                        <text x="30" y="45" fill="#10b981" fontSize="28" fontWeight="bold">Map：社区评分</text>
                                        
                                        <g transform="translate(40, 70)">
                                            <rect width="100" height="90" rx="6" fill="#064e3b" stroke="#10b981" strokeOpacity="0.5" />
                                            <text x="50" y="50" textAnchor="middle" fill="#10b981" fontSize="20">评分 0</text>
                                        </g>
                                        <g transform="translate(175, 70)">
                                            <rect width="100" height="90" rx="6" fill="#064e3b" stroke="#10b981" strokeOpacity="0.5" />
                                            <text x="50" y="50" textAnchor="middle" fill="#10b981" fontSize="20">评分 1</text>
                                        </g>
                                        <g transform="translate(310, 70)">
                                            <rect width="100" height="90" rx="6" fill="#064e3b" stroke="#10b981" strokeOpacity="0.5" />
                                            <text x="50" y="50" textAnchor="middle" fill="#10b981" fontSize="20">评分 2</text>
                                        </g>
                                    </g>

                                    {/* Reduce (Synthesize) */}
                                    <g transform="translate(50, 460)">
                                        <rect width="450" height="140" rx="10" fill="#1e293b" stroke="#10b981" strokeWidth="3" />
                                        <text x="30" y="45" fill="#10b981" fontSize="28" fontWeight="bold">Reduce：归约合成</text>
                                        
                                        <path d="M60 70 L225 120 L390 70" fill="none" stroke="#10b981" strokeWidth="4" />
                                        <circle cx="225" cy="120" r="20" fill="#10b981" filter="url(#glow-strong)" />
                                    </g>

                                    {/* Final Answer */}
                                    <g transform="translate(50, 700)">
                                        <rect width="450" height="120" rx="10" fill="#1e293b" stroke="#10b981" strokeWidth="4" />
                                        <text x="225" y="70" textAnchor="middle" fill="#10b981" fontSize="32" fontWeight="bold">全局答案 (Answer)</text>
                                    </g>

                                    {/* Connections */}
                                    <path d="M275 140 L275 200" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-emerald)" />
                                    <path d="M275 380 L275 460" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-emerald)" />
                                    <path d="M275 600 L275 700" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-emerald)" />
                                    
                                    {/* Cross connection from Communities */}
                                    <path d="M -80 700 L 0 700 L 0 300 L 50 300" fill="none" stroke="#10b981" strokeDasharray="10 10" strokeWidth="3" />
                                </motion.g>
                                </g>
                            )}

                            {/* --- ANIMATIONS --- */}
                            
                            {/* Blue Flow */}
                            {step >= 1 && (
                                <motion.circle r="8" fill="#60a5fa" filter="url(#glow-strong)">
                                    <animateMotion 
                                        dur="3s" 
                                        repeatCount="indefinite"
                                        path="M 220 160 L 300 160 L 300 240 L 300 600 L 300 750 L 680 750"
                                    />
                                </motion.circle>
                            )}

                            {/* Purple Flow */}
                            {step >= 2 && (
                                <motion.circle r="8" fill="#c084fc" filter="url(#glow-strong)">
                                    <animateMotion 
                                        dur="4s" 
                                        repeatCount="indefinite"
                                        path="M 905 160 L 905 240 M 905 600 L 905 780 L 1310 780"
                                    />
                                </motion.circle>
                            )}

                            {/* Green Flow */}
                            {step >= 3 && (
                                <motion.circle r="8" fill="#4ade80" filter="url(#glow-strong)">
                                    <animateMotion 
                                        dur="2s" 
                                        repeatCount="indefinite"
                                        path="M 1585 160 L 1585 280 M 1585 540 L 1585 640 M 1585 780 L 1585 860"
                                    />
                                </motion.circle>
                            )}

                        </svg>
                    </div>
                </div>
            )}
        </div>
    )
}

function DemoCAD() {
    const [step, setStep] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);

    React.useEffect(() => {
        const timeouts: NodeJS.Timeout[] = [];

        const runSequence = () => {
            setStep(0);
            setIsGenerating(false);
            
            // 0s: Display Input Prompt (Wait 2s)
            
            // 2s: Start Generating 2D (Duration 2s)
            timeouts.push(setTimeout(() => setIsGenerating(true), 2000));
            
            // 4s: Show 2D Plan (Duration 3s)
            timeouts.push(setTimeout(() => { setIsGenerating(false); setStep(1); }, 4000));
            
            // 7s: Start Generating BOM (Duration 2s)
            timeouts.push(setTimeout(() => setIsGenerating(true), 7000));
            
            // 9s: Show BOM (Duration 3s)
            timeouts.push(setTimeout(() => { setIsGenerating(false); setStep(2); }, 9000));

            // 12s: Start Generating Render (Duration 2s)
            timeouts.push(setTimeout(() => setIsGenerating(true), 12000));

            // 14s: Show Final Render (Duration 3s)
            timeouts.push(setTimeout(() => { setIsGenerating(false); setStep(3); }, 14000));
            
            // 17s: Loop
            timeouts.push(setTimeout(() => runSequence(), 17000));
        };

        runSequence();
        return () => timeouts.forEach(clearTimeout);
    }, []);

    // Helper to get generating text
    const getGenState = () => {
        if (step === 0) return { title: "正在生成平面方案...", sub: "AI 布局规划 · 动线分析 · 空间划分" };
        if (step === 1) return { title: "正在生成物料清单...", sub: "空间拆解 · 材料归类 · 数量估算" };
        if (step === 2) return { title: "正在渲染装修效果...", sub: "风格匹配 · 材质建议 · 灯光氛围" };
        return { title: "处理中...", sub: "请稍候" };
    };

    const genState = getGenState();

    return (
        <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden bg-zinc-900">
             <AnimatePresence mode="wait">
                {step === 0 && !isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
                        <UserPrompt text="设计一套新中式客厅装修方案，要简约大气" color="purple" />
                    </div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {isGenerating && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-40"
                    >
                        <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -10, opacity: 0 }}
                            className="rounded-2xl border border-purple-300/25 bg-white/10 backdrop-blur-2xl px-7 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                        >
                            <div className="text-white/85 font-semibold flex items-center gap-2">
                                <Box className="w-4 h-4 text-purple-200" />
                                {genState.title}
                            </div>
                            <div className="text-white/45 text-sm mt-1">{genState.sub}</div>
                            <div className="mt-4 h-1.5 w-64 rounded-full bg-white/10 overflow-hidden">
                                <motion.div 
                                    className="h-full bg-purple-400/70" 
                                    animate={{ width: ["0%", "100%"] }} 
                                    transition={{ duration: 2.0, ease: "easeInOut" }} 
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`transition-all duration-1000 w-full h-full flex items-center justify-center ${(step === 0 || isGenerating) ? 'opacity-20 blur-sm' : 'opacity-100'}`}>
                <div className="w-full h-full flex items-center justify-center">
                    <motion.div
                        className="relative w-[720px] h-[540px] bg-zinc-800/80 border-4 border-white/20 shadow-2xl"
                        initial={{ rotateX: 0, rotateZ: 0 }}
                        animate={step >= 2 ? { rotateX: 0, rotateZ: 0, scale: 1 } : { rotateX: 0, rotateZ: 0, scale: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                    >
                        {/* Floor Grid */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:25px_25px]" />
                        <div className="absolute inset-0 bg-stone-900 opacity-50" />

                        {/* Room Elements - Only show after input */}
                        {step >= 1 && (
                            <CadPlan step={step} />
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    )
}

function CadPlan({ step }: { step: number }) {
    if (step === 1) return <CadPlan2D />;
    if (step === 2) return <CadBomResult />;
    if (step === 3) return <CadRenderResult />;
    return null;
}

function CadPlan2D() {
    return (
        <div className="absolute inset-4 rounded-2xl border border-white/10 bg-white/95 overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-0 flex">
                <div className="relative flex-1 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,0,0,0.05),transparent_55%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[size:20px_20px]" />
                    <svg viewBox="0 0 560 420" className="absolute inset-0 w-full h-full">
                        <defs>
                            <marker id="dimArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                                <path d="M0,4 L8,0 L8,8 z" fill="#666666" />
                            </marker>
                            <marker id="dimTick" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                                <path d="M1,9 L9,1" stroke="#666666" strokeWidth="2" />
                            </marker>
                        </defs>

                <rect x="24" y="20" width="512" height="380" rx="10" fill="none" stroke="rgba(17,24,39,0.35)" strokeWidth="2" />
                <rect x="34" y="30" width="492" height="360" rx="8" fill="none" stroke="rgba(17,24,39,0.18)" strokeWidth="1" />

                <g>
                    <rect x="52" y="46" width="456" height="18" fill="#0b1220" />
                    <rect x="52" y="356" width="456" height="18" fill="#0b1220" />
                    <rect x="52" y="46" width="18" height="328" fill="#0b1220" />
                    <rect x="490" y="46" width="18" height="328" fill="#0b1220" />

                    <rect x="260" y="46" width="12" height="176" fill="#374151" />
                    <rect x="260" y="222" width="248" height="12" fill="#374151" />
                    <rect x="150" y="222" width="110" height="12" fill="#374151" />
                    <rect x="150" y="222" width="12" height="152" fill="#374151" />
                    <rect x="52" y="306" width="98" height="12" fill="#374151" />

                    <rect x="260" y="122" width="12" height="46" fill="#ffffff" />
                    <rect x="150" y="292" width="12" height="52" fill="#ffffff" />
                    <rect x="52" y="190" width="18" height="60" fill="#ffffff" />
                    <rect x="508" y="80" width="18" height="70" fill="#ffffff" />

                    <rect x="392" y="46" width="86" height="18" fill="#ffffff" />
                    <line x1="392" y1="54" x2="478" y2="54" stroke="rgba(17,24,39,0.65)" strokeWidth="2" />
                    <line x1="392" y1="58" x2="478" y2="58" stroke="rgba(17,24,39,0.35)" strokeWidth="2" />

                    <rect x="490" y="270" width="18" height="62" fill="#ffffff" />
                    <line x1="498" y1="270" x2="498" y2="332" stroke="rgba(17,24,39,0.65)" strokeWidth="2" />
                    <line x1="502" y1="270" x2="502" y2="332" stroke="rgba(17,24,39,0.35)" strokeWidth="2" />
                </g>

                <g>
                    <path d="M260 122 L300 122" stroke="rgba(17,24,39,0.55)" strokeWidth="1.8" />
                    <path d="M260 122 A40 40 0 0 1 300 162" fill="none" stroke="rgba(17,24,39,0.55)" strokeWidth="1.8" />

                    <path d="M150 344 L150 304" stroke="rgba(17,24,39,0.55)" strokeWidth="1.8" />
                    <path d="M150 304 A40 40 0 0 1 190 344" fill="none" stroke="rgba(17,24,39,0.55)" strokeWidth="1.8" />
                </g>

                <rect x="280" y="86" width="150" height="70" rx="8" fill="none" stroke="#E5E5E5" strokeWidth="1.2" />
                <rect x="436" y="98" width="60" height="50" rx="6" fill="none" stroke="#E5E5E5" strokeWidth="1.2" />
                <rect x="334" y="170" width="86" height="62" rx="30" fill="none" stroke="#E5E5E5" strokeWidth="1.2" />
                <rect x="290" y="252" width="188" height="74" rx="10" fill="none" stroke="#E5E5E5" strokeWidth="1.1" />
                {[
                    { x: 282, y: 242 }, { x: 446, y: 242 }, { x: 282, y: 322 }, { x: 446, y: 322 }
                ].map((c, i) => (
                    <rect key={i} x={c.x} y={c.y} width="30" height="30" rx="6" fill="none" stroke="#E5E5E5" strokeWidth="1.1" />
                ))}
                <rect x="316" y="330" width="180" height="30" rx="6" fill="none" stroke="#E5E5E5" strokeWidth="1.1" />
                <rect x="332" y="286" width="86" height="26" rx="6" fill="none" stroke="#E5E5E5" strokeWidth="1.1" />
                <rect x="422" y="286" width="86" height="26" rx="6" fill="none" stroke="#E5E5E5" strokeWidth="1.1" />

                <circle cx="92" cy="346" r="15" fill="none" stroke="rgba(16,185,129,0.45)" strokeWidth="2.4" />
                <rect x="88" y="320" width="8" height="52" rx="4" fill="none" stroke="rgba(31,41,55,0.4)" strokeWidth="2" />

                <g opacity="0.85">
                    <path d="M62 396 L498 396" stroke="#666666" strokeWidth="2" markerStart="url(#dimArrow)" markerEnd="url(#dimArrow)" />
                    <path d="M62 388 L62 404" stroke="#666666" strokeWidth="2" />
                    <path d="M498 388 L498 404" stroke="#666666" strokeWidth="2" />
                    <text x="280" y="412" textAnchor="middle" fill="#666666" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">5.8m</text>
                </g>

                <g opacity="0.85">
                    <path d="M40 46 L40 374" stroke="#666666" strokeWidth="2" markerStart="url(#dimArrow)" markerEnd="url(#dimArrow)" />
                    <path d="M46 46 L34 46" stroke="#666666" strokeWidth="2" />
                    <path d="M46 374 L34 374" stroke="#666666" strokeWidth="2" />
                    <text x="28" y="214" textAnchor="middle" fill="#666666" fontSize="12" fontFamily="ui-monospace, SFMono-Regular" transform="rotate(-90 28 214)">4.2m</text>
                </g>

                <g opacity="0.85">
                    <path d="M52 38 L508 38" stroke="#666666" strokeWidth="1.5" markerStart="url(#dimTick)" markerEnd="url(#dimTick)" />
                    <path d="M52 46 L52 32" stroke="#666666" strokeWidth="1.5" />
                    <path d="M508 46 L508 32" stroke="#666666" strokeWidth="1.5" />
                    <text x="280" y="30" textAnchor="middle" fill="#666666" fontSize="11" fontFamily="ui-monospace, SFMono-Regular">轴线 A—A</text>
                </g>

                <g opacity="0.85">
                    <path d="M260 84 L508 84" stroke="#666666" strokeWidth="1.6" markerStart="url(#dimArrow)" markerEnd="url(#dimArrow)" />
                    <path d="M260 222 L260 76" stroke="#666666" strokeOpacity="0.55" strokeWidth="1.5" />
                    <path d="M508 222 L508 76" stroke="#666666" strokeOpacity="0.55" strokeWidth="1.5" />
                    <text x="384" y="76" textAnchor="middle" fill="#666666" fontSize="11" fontFamily="ui-monospace, SFMono-Regular">3.2m</text>
                </g>

                <g opacity="0.85">
                    <path d="M30 222 L30 374" stroke="#666666" strokeWidth="1.6" markerStart="url(#dimArrow)" markerEnd="url(#dimArrow)" />
                    <path d="M52 222 L22 222" stroke="#666666" strokeOpacity="0.55" strokeWidth="1.5" />
                    <path d="M150 374 L22 374" stroke="#666666" strokeOpacity="0.55" strokeWidth="1.5" />
                    <text x="18" y="302" textAnchor="middle" fill="#666666" fontSize="11" fontFamily="ui-monospace, SFMono-Regular" transform="rotate(-90 18 302)">1.2m</text>
                </g>

                <g opacity="0.9">
                    <path d="M520 58 L540 58 L530 38 Z" fill="rgba(17,24,39,0.55)" />
                    <text x="530" y="78" textAnchor="middle" fill="rgba(17,24,39,0.55)" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">N</text>
                </g>

                <text x="78" y="96" fill="rgba(17,24,39,0.5)" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">玄关</text>
                <text x="292" y="96" fill="rgba(17,24,39,0.5)" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">客厅</text>
                <text x="292" y="246" fill="rgba(17,24,39,0.5)" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">餐厅</text>
                <text x="78" y="344" fill="rgba(17,24,39,0.5)" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">走廊</text>
                <text x="304" y="364" fill="rgba(17,24,39,0.5)" fontSize="12" fontFamily="ui-monospace, SFMono-Regular">厨房</text>

                <g opacity="0.95">
                    <circle cx="276" cy="86" r="4.5" fill="rgba(2,132,199,0.95)" />
                    <path d="M272 86 L280 86" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" />
                    <path d="M276 82 L276 90" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" />
                    <text x="284" y="90" fill="rgba(17,24,39,0.55)" fontSize="10" fontFamily="ui-monospace, SFMono-Regular">索引 1/PL-01</text>
                </g>

                <g opacity="0.95">
                    <circle cx="306" cy="162" r="7.5" fill="rgba(34,197,94,0.9)" stroke="rgba(17,24,39,0.35)" strokeWidth="1.2" />
                    <text x="306" y="166" textAnchor="middle" fill="rgba(255,255,255,0.95)" fontSize="9" fontFamily="ui-monospace, SFMono-Regular">S</text>
                </g>

                <g opacity="0.95">
                    <circle cx="332" cy="164" r="7.5" fill="rgba(234,179,8,0.9)" stroke="rgba(17,24,39,0.35)" strokeWidth="1.2" />
                    <text x="332" y="168" textAnchor="middle" fill="rgba(17,24,39,0.85)" fontSize="9" fontFamily="ui-monospace, SFMono-Regular">K</text>
                </g>

                        <g opacity="0.45">
                            <path d="M252 46 L252 222" stroke="#666666" strokeWidth="1.2" strokeDasharray="6 6" />
                        </g>
                    </svg>
                </div>

                <CadInfoPanel />
            </div>
        </div>
    );
}

function CadBomResult() {
    return (
        <div className="absolute inset-4 rounded-2xl border border-white/10 bg-white/95 overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="h-12 px-5 flex items-center justify-between border-b border-black/10 bg-white">
                <div className="text-sm font-medium text-black/75">物料清单（示例）</div>
                <div className="text-xs text-black/40 font-mono">BOM · Auto Estimated</div>
            </div>
            <div className="p-5">
                <div className="grid grid-cols-6 text-xs font-medium text-black/55 border-b border-black/10 pb-2">
                    <div>品类</div>
                    <div className="col-span-2">名称</div>
                    <div>规格</div>
                    <div className="text-right">数量</div>
                    <div className="text-right">单位</div>
                </div>
                <div className="mt-2 space-y-2 text-xs text-black/70">
                    {[
                        { c: "地面", n: "木地板/地砖", s: "客厅 12mm", q: "28", u: "㎡" },
                        { c: "墙面", n: "乳胶漆", s: "哑光 · 暖白", q: "85", u: "㎡" },
                        { c: "顶面", n: "石膏线/灯槽", s: "简约线性", q: "18", u: "m" },
                        { c: "照明", n: "主灯 + 筒灯", s: "3000K", q: "12", u: "盏" },
                        { c: "软装", n: "窗帘", s: "亚麻 · 浅灰", q: "2", u: "套" }
                    ].map((r, idx) => (
                        <div key={idx} className="grid grid-cols-6 items-center rounded-lg border border-black/10 bg-white/70 px-3 py-2">
                            <div className="text-black/65">{r.c}</div>
                            <div className="col-span-2">{r.n}</div>
                            <div className="text-black/55">{r.s}</div>
                            <div className="text-right font-mono">{r.q}</div>
                            <div className="text-right text-black/55">{r.u}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CadRenderResult() {
    return (
        <div className="absolute inset-0 rounded-2xl border border-white/10 overflow-hidden bg-black">
             <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                transition={{ duration: 1.0 }}
                className="w-full h-full relative"
            >
                <img 
                    src="/templates/unnamed.jpg" 
                    alt="Final Render" 
                    className="w-full h-full object-cover"
                />
                
                {/* Overlay Text */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-8">
                    <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="flex justify-between items-end"
                    >
                        <div>
                            <div className="text-white/90 text-2xl font-light mb-1 font-artistic">新中式 · 禅意雅居</div>
                            <div className="text-white/50 text-sm font-mono">RENDERED BY NEXUS AI · 8K ULTRA HD</div>
                        </div>
                        <div className="flex gap-2">
                             <div className="px-3 py-1 rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-xs text-white/70">
                                极致光影
                             </div>
                             <div className="px-3 py-1 rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-xs text-white/70">
                                材质还原
                             </div>
                        </div>
                    </motion.div>
                </div>

                {/* Scanline Effect */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_4px] pointer-events-none opacity-50" />
            </motion.div>
        </div>
    )
}

function CadInfoPanel() {
    return (
        <div className="w-[200px] shrink-0 border-l border-black/10 bg-white/70">
            <div className="h-full px-3 py-3 flex flex-col">
                <div className="rounded-lg border border-black/15 bg-white/90 backdrop-blur-sm text-[10px] text-black/70 font-mono overflow-hidden">
                    <div className="px-3 py-2 border-b border-black/10 text-black/80 text-[12px] font-semibold text-center">室内平面布置图</div>
                    <div className="grid grid-cols-[58px_1fr]">
                        <div className="px-2 py-1 border-b border-black/10">图号</div>
                        <div className="px-2 py-1 border-b border-black/10 text-black/80">PL-01</div>
                        <div className="px-2 py-1 border-b border-black/10">比例</div>
                        <div className="px-2 py-1 border-b border-black/10 text-black/80">1:50</div>
                        <div className="px-2 py-1 border-b border-black/10">日期</div>
                        <div className="px-2 py-1 border-b border-black/10 text-black/80">2026-01</div>
                        <div className="px-2 py-1 border-b border-black/10">标高</div>
                        <div className="px-2 py-1 border-b border-black/10 text-black/80">±0.000</div>
                        <div className="px-2 py-1 border-b border-black/10">墙厚</div>
                        <div className="px-2 py-1 border-b border-black/10 text-black/80">外墙240 / 内墙120</div>
                    </div>

                    <div className="px-3 py-2 border-t border-black/10">
                        <div className="text-black/70 mb-1">图例</div>
                        <div className="grid grid-cols-[64px_1fr] gap-y-1 items-center">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-[6px] bg-[#0b1220]" />
                            </div>
                            <div>承重墙</div>
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-[4px] bg-[#374151]" />
                            </div>
                            <div>非承重墙</div>
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-[2px] bg-black/35" />
                                <div className="w-[2px] h-[8px] bg-black/35" />
                            </div>
                            <div>门窗线</div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-green-500/90 border border-black/20 flex items-center justify-center text-white/95 text-[9px]">S</div>
                            </div>
                            <div>插座</div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-yellow-400/90 border border-black/20 flex items-center justify-center text-black/85 text-[9px]">K</div>
                            </div>
                            <div>开关</div>
                        </div>
                    </div>
                </div>
                <div className="flex-1" />
            </div>
        </div>
    );
}

function DemoPPT() {
    const pdfUrl = "/pdf/GraphRAG_Global_Knowledge_Structure.pdf";
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [phase, setPhase] = useState<"prompt" | "generating" | "scrolling">("prompt");
    const [cycle, setCycle] = useState(0);
    const [showSlides, setShowSlides] = useState(false);
    const slideCount = Math.min((pdfDoc as any)?.numPages ?? 0, 10);
    const stageRef = React.useRef<HTMLDivElement | null>(null);
    const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 960, h: 720 });
    const [pageRatio, setPageRatio] = useState(16 / 9);
    const maxScale = 1.0;
    const baseSlideWidth = Math.max(
        320,
        Math.min(
            600,
            Math.floor(stageSize.w - 120),
            Math.floor((stageSize.h - 140) * pageRatio)
        )
    );
    const itemGap = Math.floor(baseSlideWidth / pageRatio) * 0.8;
    const startScroll = 0;
    const endScroll = Math.max(0, (slideCount - 1) * itemGap);
    const scroll = useMotionValue(startScroll);

    React.useEffect(() => {
        if (pdfDoc) return;
        getPdfDocumentFromUrl(pdfUrl)
            .then((doc) => setPdfDoc(doc))
            .catch(() => setLoadError("PDF 解析失败"));
    }, [pdfDoc, pdfUrl]);

    React.useEffect(() => {
        if (!pdfDoc) return;
        let cancelled = false;
        pdfDoc
            .getPage(1)
            .then((page: any) => {
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 1 });
                const ratio = viewport.width / viewport.height;
                if (Number.isFinite(ratio) && ratio > 0.2 && ratio < 5) setPageRatio(ratio);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [pdfDoc]);

    React.useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            setStageSize({ w: el.clientWidth, h: el.clientHeight });
        });
        ro.observe(el);
        setStageSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    React.useEffect(() => {
        if (!pdfDoc || loadError) return;
        if (slideCount <= 0) return;
        let t1: NodeJS.Timeout | null = null;
        let t2: NodeJS.Timeout | null = null;
        let t3: NodeJS.Timeout | null = null;
        let t4: NodeJS.Timeout | null = null;
        let controls: any;

        setPhase("prompt");
        setShowSlides(false);
        scroll.set(startScroll);

        t1 = setTimeout(() => {
            setPhase("generating");
        }, 2800);

        t2 = setTimeout(() => {
            setPhase("scrolling");
            setShowSlides(true);
            controls = animate(scroll, endScroll, {
                duration: 12.5,
                ease: "linear",
                onComplete: () => {
                    setShowSlides(false);
                    setPhase("prompt");
                    scroll.set(startScroll);
                    t3 = setTimeout(() => setCycle((c) => c + 1), 900);
                }
            });
        }, 4800);

        return () => {
            if (t1) clearTimeout(t1);
            if (t2) clearTimeout(t2);
            if (t3) clearTimeout(t3);
            if (t4) clearTimeout(t4);
            controls?.stop?.();
        };
    }, [cycle, endScroll, loadError, pdfDoc, scroll, slideCount, startScroll]);

    return (
        <div ref={stageRef} className="w-full h-full relative overflow-hidden">
            {loadError && (
                <div className="absolute inset-0 flex items-center justify-center text-red-200">{loadError}</div>
            )}

            {!loadError && !pdfDoc && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full max-w-xl rounded-2xl border border-white/18 bg-white/10 backdrop-blur-2xl p-6 text-white/60">
                        正在加载演示文稿…
                    </div>
                </div>
            )}

            <AnimatePresence mode="wait">
                {phase === "prompt" && (
                    <motion.div
                        key="prompt"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className="absolute inset-0 flex items-center justify-center z-30"
                    >
                        <UserPrompt text="生成一份 GraphRAG 的演示文稿，要结构清晰、视觉震撼" color="cyan" />
                    </motion.div>
                )}
                {phase === "generating" && (
                    <motion.div
                        key="generating"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-40 pointer-events-none"
                    >
                        <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -10, opacity: 0 }}
                            className="rounded-2xl border border-cyan-300/25 bg-white/10 backdrop-blur-2xl px-7 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                        >
                            <div className="text-white/85 font-semibold flex items-center gap-2">
                                <FileText className="w-4 h-4 text-cyan-200" />
                                开始生成 PPT…
                            </div>
                            <div className="text-white/45 text-sm mt-1">抽取要点 · 自动排版 · 渲染幻灯片</div>
                            <div className="mt-4 h-1.5 w-64 rounded-full bg-white/10 overflow-hidden">
                                <motion.div
                                    className="h-full bg-cyan-300/80"
                                    animate={{ width: ["0%", "100%"] }}
                                    transition={{ duration: 2.0, ease: "easeInOut" }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {!loadError && pdfDoc && slideCount > 0 && showSlides && (
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative w-full h-full">
                            {Array.from({ length: slideCount }).map((_, idx) => (
                                <PptSlideItem
                                    key={idx}
                                    index={idx}
                                    pdf={pdfDoc}
                                    scroll={scroll}
                                    itemGap={itemGap}
                                    slideWidth={baseSlideWidth}
                                    maxScale={maxScale}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function PptSlideItem({ index, pdf, scroll, itemGap, slideWidth, maxScale }: { index: number; pdf: any; scroll: any; itemGap: number; slideWidth: number; maxScale: number }) {
    const y = useTransform(scroll, (v: number) => index * itemGap - v);
    const scale = useTransform(scroll, (v: number) => {
        const d = Math.abs(index * itemGap - v) / itemGap;
        return Math.max(0.6, maxScale - d * 0.4);
    });
    const opacity = useTransform(scroll, (v: number) => {
        const d = Math.abs(index * itemGap - v) / itemGap;
        return Math.max(0.3, 1 - d * 0.6);
    });
    const blur = useTransform(scroll, (v: number) => {
        const d = Math.abs(index * itemGap - v) / itemGap;
        return `blur(${Math.min(8, d * 2)}px)`;
    });

    return (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div style={{ y, scale, opacity, filter: blur }}>
                <div className="rounded-2xl border border-cyan-300/20 bg-white/8 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] p-3">
                    <div className="text-white/40 text-xs font-mono px-2 pb-2">SLIDE {String(index + 1).padStart(2, "0")}</div>
                    <PdfSlideCanvas pdf={pdf} pageNumber={index + 1} targetWidth={slideWidth} />
                </div>
            </motion.div>
        </div>
    );
}

function PdfSlideCanvas({ pdf, pageNumber, targetWidth }: { pdf: any; pageNumber: number; targetWidth: number }) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const [size, setSize] = useState<{ w: number; h: number }>({ w: targetWidth, h: Math.round(targetWidth * 0.5625) });
    const [ready, setReady] = useState(false);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cancelled = false;
        setReady(false);
        renderPdfPageToCanvas({ pdf, pageNumber, canvas, targetWidth })
            .then(() => {
                if (cancelled) return;
                setSize({ w: canvas.clientWidth || targetWidth, h: canvas.clientHeight || Math.round(targetWidth * 0.5625) });
                setReady(true);
            })
            .catch(() => {
                if (cancelled) return;
                setReady(true);
            });
        return () => {
            cancelled = true;
        };
    }, [pageNumber, pdf, targetWidth]);

    return (
        <div className="w-full flex justify-center">
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black" style={{ width: targetWidth, minHeight: Math.max(140, size.h) }}>
                {!ready && <div className="absolute inset-0 bg-white/5 animate-pulse" style={{ height: Math.max(140, size.h) }} />}
                <canvas ref={canvasRef} className="block" />
            </div>
        </div>
    );
}

// Utility Component for Typing Effect
function Typewriter({ text, speed = 50 }: { text: string, speed?: number }) {
    const [displayed, setDisplayed] = useState("");
    
    React.useEffect(() => {
        let i = 0;
        setDisplayed("");
        const timer = setInterval(() => {
            if (i < text.length) {
                setDisplayed((prev) => prev + text.charAt(i));
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);
        return () => clearInterval(timer);
    }, [text, speed]);

    return <span>{displayed}<span className="animate-pulse">|</span></span>;
}
