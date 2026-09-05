import { motion } from "motion/react";
import { SPRING } from "@/shared/motion";
import { FileText, Lightbulb, Loader2, Presentation, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { isPdfFile } from "@/workspaces/ppt/canvas/lib/deck-source";
import type { CreationProgress } from "@/workspaces/ppt/canvas/lib/creation-machine";
import type { useCreationInputs } from "@/workspaces/ppt/canvas/hooks/use-creation-inputs";
import type { useTemplateLibrary } from "@/workspaces/ppt/canvas/hooks/use-template-library";

interface CreationStartProps {
  inputs: ReturnType<typeof useCreationInputs>;
  templateLibrary: ReturnType<typeof useTemplateLibrary>;
  progress: CreationProgress;
  tr: (zh: string, en: string) => string;
  onGenerateOutline: () => void;
  onLoadOutline: () => void;
  onStartBeautify: () => void;
  onStartImageTransform: () => void;
}

/**
 * The first screen: pick a template, pick a flow, and give it something to
 * work from. Four flows share it because they differ only in what they take
 * as input -- an idea, an outline, or a PDF to rework.
 */
export function CreationStart({
  inputs,
  templateLibrary,
  progress,
  tr,
  onGenerateOutline,
  onLoadOutline,
  onStartBeautify,
  onStartImageTransform,
}: CreationStartProps) {
  const { creationMode } = inputs;
    const tabs = [
      { id: 'idea', label: tr('想法', 'Idea') },
      { id: 'outline', label: tr('大纲', 'Outline') },
      { id: 'beautify', label: tr('PPT美化', 'Beautify') },
      { id: 'image_transform', label: tr('图片PPT转化', 'Image PPT Transform') },
    ];
    const modeCopy = (() => {
        if (creationMode === "outline") {
            return {
                hint: tr("已有大纲？直接粘贴即可快速生成，AI 将自动结构化。", "Have an outline? Paste it and AI will structure it into slides."),
                placeholder: tr(
                  "粘贴你的 PPT 大纲，例如：\n第一部分：AI 起源\n- 1950 年代\n- 达特茅斯会议",
                  "Paste your PPT outline, for example:\nPart 1: Origins of AI\n- 1950s\n- Dartmouth workshop"
                )
            };
        }
        if (creationMode === "beautify") {
            return {
                hint: tr("上传 PDF，输入美化要求，然后并发渲染每一页。", "Upload PDF, enter requirements, then beautify each page in parallel."),
                placeholder: tr(
                  "例如：整体更高级、留白更充足、标题层级更明显、配色更统一；保持原文案不变。",
                  "e.g. More premium look, more whitespace, stronger title hierarchy, unified palette, higher contrast; keep all original text unchanged."
                )
            };
        }
        if (creationMode === "image_transform") {
            return {
                hint: tr("上传 PDF，系统会将每一页导入为图片幻灯片；仅在导出可编辑 PPTX 时才进行文字识别。", "Upload a PDF and the system will import each page as an image slide; text recognition runs only for editable PPTX export."),
                placeholder: "",
            };
        }
        return {
            hint: tr("输入你的想法，AI 将为你生成完整 PPT", "Describe your idea and AI will generate a full deck."),
            placeholder: tr("例如：生成一份关于 AI 发展史的演讲 PPT", "e.g. Create a presentation about the history of AI")
        };
    })();


  return (
        <div className="w-full h-full bg-sunken/50 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-4xl mx-auto space-y-8 bg-card p-8 rounded-2xl shadow-soft border border-border/60">

                <div className="space-y-8">
                    {/* Template Selection */}
                    {creationMode !== "image_transform" ? (
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/12 text-primary-strong text-xs flex items-center justify-center font-bold">1</span>
                            {tr("选择或上传参考模板", "Choose or upload a reference template")}
                        </label>
                        
                        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                            <label className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-border hover:border-primary hover:bg-primary/[0.08]">
                                <div className="flex flex-col items-center text-muted-foreground/70 group-hover:text-primary-strong transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2 group-hover:bg-primary/12 transition-colors">
                                        <Upload className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-medium">{tr("添加模板", "Add template")}</span>
                                </div>
                                <input type="file" accept="image/*" multiple className="hidden" onChange={templateLibrary.handleUploadInputChange} />
                            </label>
                            <button
                              type="button"
                              onClick={() => templateLibrary.generator.setOpen(true)}
                              title={tr("AI生成模板", "AI generate template")}
                              className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-border hover:border-primary hover:bg-primary/[0.08]"
                            >
                                <div className="flex flex-col items-center text-muted-foreground/70 group-hover:text-primary-strong transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2 group-hover:bg-primary/12 transition-colors">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-medium">{tr("AI生成模板", "AI generate")}</span>
                                </div>
                            </button>
                            {templateLibrary.templates.map((t, i) => (
                                <div
                                    key={t.id}
                                    onClick={() => void templateLibrary.selectTemplate(t)}
                                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                                    className={`animate-rise-in cursor-pointer border rounded-xl overflow-hidden relative aspect-video group transition-all duration-base ease-out-soft bg-muted ${
                                        templateLibrary.selectedTemplateId === t.id
                                            ? "border-primary ring-2 ring-primary shadow-md"
                                            : "border-border hover:ring-2 hover:ring-primary hover:shadow-md"
                                    }`}
                                >
                                    <img src={t.previewSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={t.name} />
                                    {templateLibrary.selectedTemplateId === t.id && (
                                        <div className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-xs">
                                            {tr("已选择", "Selected")}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            templateLibrary.deleteTemplate(t);
                                        }}
                                        className="absolute top-2 right-2 rounded-full bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title={tr("删除模板", "Delete template")}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <div className="text-white text-xs font-medium text-center">{t.name}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    ) : null}

                    {/* Mode Selection & Input */}
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/12 text-primary-strong text-xs flex items-center justify-center font-bold">{creationMode === "image_transform" ? "1" : "2"}</span>
                            {tr("输入内容", "Input")}
                        </label>

                        {/* Segmented Control */}
                        <div className="bg-muted p-1 rounded-lg inline-flex w-full sm:w-auto">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => inputs.setCreationMode(tab.id as any)}
                                    title={tab.label}
                                    className={`relative flex-1 sm:flex-none px-6 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                                        creationMode === tab.id 
                                            ? "text-foreground shadow-sm" 
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {creationMode === tab.id && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-card rounded-md shadow-xs"
                                            transition={SPRING.snap}
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        <input
                            ref={inputs.reference.inputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.zip,.tex,.tgz,.tar.gz,application/pdf,application/zip,application/x-zip-compressed,application/gzip,application/x-gzip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*,.txt,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                            className="hidden"
                            onChange={inputs.reference.onInputChange}
                        />

                        <motion.div
                            key={creationMode}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                        >
                            <div className="flex items-center gap-2 text-sm text-foreground/80">
                                {creationMode === "beautify" ? <Sparkles className="w-4 h-4 text-primary-strong" /> : creationMode === "image_transform" ? <Presentation className="w-4 h-4 text-primary-strong" /> : <Lightbulb className="w-4 h-4 text-primary-strong" />}
                                <span>{modeCopy.hint}</span>
                            </div>

                            {creationMode === "beautify" ? (
                              <div className="space-y-3">
                                <input
                                  ref={inputs.beautify.inputRef}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={inputs.beautify.onInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-sunken px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-foreground">{tr("上传 PDF", "Upload PDF")}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {inputs.beautify.file ? inputs.beautify.file.name : tr("未选择文件", "No file selected")}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => inputs.beautify.inputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {tr("选择文件", "Choose")}
                                  </Button>
                                </div>

                                <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-sunken px-4 py-3 cursor-pointer">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-foreground">{tr("启用模板美化（可选）", "Use template for beautify (optional)")}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {tr("开启后将把当前模板传给美化模型；关闭则仅基于上传的幻灯片美化。", "When enabled, current template is passed to beautify model; otherwise beautify uses only uploaded slides.")}
                                    </div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={inputs.beautify.useTemplate}
                                    onChange={(e) => inputs.beautify.setUseTemplate(e.target.checked)}
                                    className="h-4 w-4 rounded border-input text-primary-strong focus:ring-ring"
                                  />
                                </label>

                                <textarea
                                  value={inputs.beautify.requirement}
                                  onChange={(e) => inputs.beautify.setRequirement(e.target.value)}
                                  className="w-full h-36 p-4 rounded-xl border border-border bg-sunken text-sm focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all resize-none outline-none"
                                  placeholder={modeCopy.placeholder}
                                />
                              </div>
                            ) : creationMode === "image_transform" ? (
                              <div className="space-y-3">
                                <input
                                  ref={inputs.imageTransform.inputRef}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={inputs.imageTransform.onInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-sunken px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-foreground">{tr("上传 PDF", "Upload PDF")}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {inputs.imageTransform.file ? inputs.imageTransform.file.name : tr("未选择文件", "No file selected")}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => inputs.imageTransform.inputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {tr("选择文件", "Choose")}
                                  </Button>
                                </div>

                                <div className="rounded-xl border border-border bg-sunken px-4 py-3 text-xs text-muted-foreground leading-6">
                                  <div>{tr("处理结果：", "Output:")}</div>
                                  <div>{tr("系统会把 PDF 每一页导入为图片幻灯片。", "The system imports each PDF page as an image slide.")}</div>
                                  <div>{tr("如需可编辑文字，请在导出可编辑 PPTX 时再进行文字识别与回填。", "If you need editable text, recognition and text refill happen only during editable PPTX export.")}</div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="relative">
                                    <textarea 
                                        value={creationMode === "idea" ? inputs.ideaInput : inputs.outlineInput}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (creationMode === "idea") inputs.setIdeaInput(v);
                                            else inputs.setOutlineInput(v);
                                        }}
                                        className="w-full h-40 p-4 pb-12 rounded-xl border border-border bg-sunken text-sm focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all resize-none outline-none"
                                        placeholder={modeCopy.placeholder}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => inputs.reference.inputRef.current?.click()}
                                        disabled={inputs.reference.isParsing}
                                        title={tr("上传参考文件", "Upload reference files")}
                                        className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs text-foreground/80 shadow-xs hover:bg-card transition-colors disabled:opacity-60"
                                    >
                                        {inputs.reference.isParsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {tr("上传文件", "Upload files")}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-muted-foreground">
                                        {tr(
                                          "上传 PDF/Word/LaTeX/TXT作为参考资料（可选）；推荐 Word/LaTeX，图表素材更稳定。",
                                          "Upload PDF/Word/LaTeX/TXT as reference (optional); Word/LaTeX recommended for stable figures."
                                        )}
                                    </div>
                                    {inputs.reference.files.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => inputs.reference.setUploadFiles([])}
                                            title={tr("清空参考文件", "Clear reference files")}
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                            disabled={inputs.reference.isParsing}
                                        >
                                            {tr("清空", "Clear")}
                                        </button>
                                    )}
                                </div>

                                {inputs.reference.files.length > 0 && (
                                    <div className="grid gap-2">
                                        {inputs.reference.files.map((f) => (
                                            <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-sunken px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => inputs.reference.openPreview(f)}
                                                    title={tr("预览文件", "Preview file")}
                                                    className="flex items-center gap-2 min-w-0 text-left"
                                                >
                                                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                    <span className="truncate text-sm text-foreground/90">{f.filename}</span>
                                                    <span className="text-xs text-muted-foreground flex-shrink-0">({f.charCount} chars)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs text-muted-foreground hover:text-foreground"
                                                    title={tr("移除文件", "Remove file")}
                                                    onClick={() => {
                                                      const nextFiles = inputs.reference.uploadFiles.filter((rf) => rf.name !== f.filename);
                                                      void inputs.reference.handleFileChange(nextFiles);
                                                    }}
                                                >
                                                    {tr("移除", "Remove")}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                              </>
                            )}
                        </motion.div>
                    </div>

                    <Button 
                        onClick={creationMode === "beautify" ? onStartBeautify : creationMode === "image_transform" ? onStartImageTransform : creationMode === "idea" ? onGenerateOutline : onLoadOutline}
                        disabled={Boolean(progress.message) || (creationMode === "beautify" ? !inputs.beautify.file : creationMode === "image_transform" ? !inputs.imageTransform.file || !isPdfFile(inputs.imageTransform.file) : inputs.reference.isParsing || (creationMode === "idea" ? !inputs.ideaInput.trim() : !inputs.outlineInput.trim()))}
                        size="lg"
                        // The blue-to-indigo gradient was the loudest element on
                        // the screen; the solid variant carries the same weight
                        // without introducing a second hue.
                        className="w-full h-auto py-5 text-lg font-semibold tracking-[-0.01em] rounded-xl shadow-soft hover:shadow-soft-lg"
                    >
                        {/* `size-5`, not `w-5 h-5`: the button's own
                            `[&_svg:not([class*='size-'])]:size-4` rule outranks a
                            plain width/height pair, so these icons were 16px. */}
                        {progress.message ? <Loader2 className="size-5 mr-2 animate-spin" /> : <Sparkles className="size-5 mr-2" />}
                        {progress.message || (creationMode === "beautify" ? tr("开始渲染", "Start rendering") : creationMode === "image_transform" ? tr("开始转化", "Start transform") : creationMode === "idea" ? tr("开始生成大纲", "Generate outline") : tr("载入大纲", "Load outline"))}
                    </Button>
                </div>

                <Dialog open={inputs.reference.previewOpen} onOpenChange={inputs.reference.setPreviewOpen}>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>{inputs.reference.previewFile?.filename || tr("参考文件", "Reference file")}</DialogTitle>
                        </DialogHeader>
                        <Textarea value={inputs.reference.previewFile?.content || ""} readOnly className="min-h-[420px] font-mono text-xs" />
                    </DialogContent>
                </Dialog>

                <Dialog open={templateLibrary.generator.open} onOpenChange={templateLibrary.generator.setOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{tr("AI生成模板", "AI Template Generator")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="text-xs text-muted-foreground">
                                {tr("生成的模板会自动加入模板列表，可随时删除。", "Generated templateLibrary.templates will be added to the template list automatically and can be deleted anytime.")}
                            </div>
                            <Textarea
                              value={templateLibrary.generator.requirement}
                              onChange={(e) => templateLibrary.generator.setRequirement(e.target.value)}
                              placeholder={tr(
                                "例如：科技感、深色背景、蓝紫渐变、玻璃拟态、留白充足；不要出现任何文字。",
                                "e.g. Futuristic, dark background, blue-purple gradient, glassmorphism, generous whitespace; no text."
                              )}
                              className="min-h-[140px]"
                              disabled={templateLibrary.generator.isGenerating}
                            />
                            <div className="flex justify-end gap-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => templateLibrary.generator.setOpen(false)}
                                  disabled={templateLibrary.generator.isGenerating}
                                >
                                  {tr("取消", "Cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={templateLibrary.generator.generate}
                                  disabled={templateLibrary.generator.isGenerating || !templateLibrary.generator.requirement.trim()}
                                  className="bg-primary hover:bg-primary/90"
                                >
                                  {templateLibrary.generator.isGenerating ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      {tr("生成中...", "Generating...")}
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-4 h-4 mr-2" />
                                      {tr("生成并保存", "Generate & Save")}
                                    </>
                                  )}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
              </div>
            </div>
        </div>
  );
}
