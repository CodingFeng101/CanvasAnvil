import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Eye, EyeOff, Loader2, Save, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { getAIConfig, saveAIConfig, type AIConfig } from "@/lib/ai-client";
import { Button } from "@/components/ui/button";
import { getUiLanguage, setUiLanguage, type UiLanguage } from "@/lib/ui-language";
import { t } from "@/lib/i18n";
import {
  IMAGE_PROVIDER_OPTIONS,
  TEXT_PROVIDER_OPTIONS,
  getDefaultBaseUrl,
  normalizeAIConfig,
  type AIProviderId,
} from "@/lib/ai/provider-registry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/workspaces/flow/next/components/ui/select";

type ChannelKind = "text" | "image";
type TestState = "idle" | "testing";

const TEXT_PROVIDER_LINKS: Partial<Record<AIProviderId, string>> = {
  openai: "https://platform.openai.com/api-keys",
  ollama: "https://ollama.com/download",
  deepseek: "https://platform.deepseek.com/api_keys",
  kimi: "https://platform.moonshot.cn/console/api-keys",
  aliyun: "https://bailian.console.aliyun.com/?tab=model#/api-key",
  tencent: "https://console.cloud.tencent.com/hunyuan/api-key",
  bytedance: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
  zhipu: "https://open.bigmodel.cn/usercenter/apikeys",
  baidu: "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application",
  minimax: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
  xai: "https://console.x.ai/",
  google: "https://aistudio.google.com/app/apikey",
  anthropic: "https://console.anthropic.com/settings/keys",
};

const IMAGE_PROVIDER_LINKS: Partial<Record<AIProviderId, string>> = {
  openai: "https://platform.openai.com/api-keys",
  aliyun: "https://bailian.console.aliyun.com/?tab=model#/api-key",
  tencent: "https://console.cloud.tencent.com/hunyuan/api-key",
  bytedance: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
  google: "https://console.cloud.google.com/vertex-ai/publishers/google/model-garden/imagen",
};

const MINERU_LINK = "https://mineru.net/";

function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function LinkText({
  href,
  uiLang,
}: {
  href?: string;
  uiLang: UiLanguage;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      {uiLang === "zh" ? "获取 Key" : "Get Key"}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function ProviderField({
  label,
  value,
  onChange,
  options,
  docsUrl,
  uiLang,
}: {
  label: string;
  value: string;
  onChange: (value: AIProviderId) => void;
  options: Array<{ id: AIProviderId; label: string }>;
  docsUrl?: string;
  uiLang: UiLanguage;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <LinkText href={docsUrl} uiLang={uiLang} />
      </div>
      <Select value={value} onValueChange={(next) => onChange(next as AIProviderId)}>
        <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-border hover:bg-muted/20">
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent className="max-h-[260px] overflow-y-auto rounded-xl border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur">
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              className="rounded-lg py-2 text-sm data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggle,
  docsUrl,
  uiLang,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  docsUrl?: string;
  uiLang: UiLanguage;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <LinkText href={docsUrl} uiLang={uiLang} />
      </div>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? "Hide secret" : "Show secret"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function TestButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: TestState;
  onClick: () => void;
}) {
  const loading = state === "testing";
  return (
    <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<AIConfig>(normalizeAIConfig(getAIConfig()));
  const [uiLang, setUiLangState] = useState<UiLanguage>(() => getUiLanguage());
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [showMineruKey, setShowMineruKey] = useState(false);
  const [textTestState, setTextTestState] = useState<TestState>("idle");
  const [imageTestState, setImageTestState] = useState<TestState>("idle");

  useEffect(() => {
    if (!isOpen) return;
    setConfig(normalizeAIConfig(getAIConfig()));
    setUiLangState(getUiLanguage());
    setShowTextKey(false);
    setShowImageKey(false);
    setShowMineruKey(false);
    setTextTestState("idle");
    setImageTestState("idle");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setUiLanguage(uiLang);
  }, [uiLang, isOpen]);

  const isZh = uiLang === "zh";

  const textProviderLink = useMemo(
    () => TEXT_PROVIDER_LINKS[config.textProvider as AIProviderId],
    [config.textProvider],
  );
  const imageProviderLink = useMemo(
    () => IMAGE_PROVIDER_LINKS[config.imageProvider as AIProviderId],
    [config.imageProvider],
  );

  const handleProviderChange = (kind: ChannelKind, provider: AIProviderId) => {
    const normalized = normalizeAIConfig(config);
    const defaultBaseUrl = getDefaultBaseUrl(provider, kind);

    if (kind === "text") {
      setConfig({
        ...normalized,
        textProvider: provider,
        textBaseUrl: defaultBaseUrl || normalized.textBaseUrl,
      });
      return;
    }

    setConfig({
      ...normalized,
      imageProvider: provider,
      imageBaseUrl: defaultBaseUrl || normalized.imageBaseUrl,
    });
  };

  const handleSave = () => {
    saveAIConfig(config);
    setUiLanguage(uiLang);
    setIsOpen(false);
    toast.success(isZh ? "配置已保存" : "Settings saved");
  };

  const handleTestText = async () => {
    const normalized = normalizeAIConfig(config);
    if (!normalized.textApiKey || !normalized.textBaseUrl || !normalized.textModel) {
      toast.error(isZh ? "请先填写文本模型的 Key、Base URL 和 Model" : "Please fill text API key, base URL, and model first");
      return;
    }

    try {
      setTextTestState("testing");
      const response = await fetch("/api/ppt-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "chat",
          aiConfig: normalized,
          messages: [{ role: "user", content: "Reply with OK only." }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || "Text model test failed"));
      }
      toast.success(isZh ? "文本模型可用" : "Text model is working");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isZh ? "文本模型测试失败" : "Text model test failed");
    } finally {
      setTextTestState("idle");
    }
  };

  const handleTestImage = async () => {
    const normalized = normalizeAIConfig(config);
    if (!normalized.imageApiKey || !normalized.imageBaseUrl || !normalized.imageModel) {
      toast.error(isZh ? "请先填写生图模型的 Key、Base URL 和 Model" : "Please fill image API key, base URL, and model first");
      return;
    }

    try {
      setImageTestState("testing");
      const response = await fetch("/api/ppt-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "image",
          aiConfig: normalized,
          prompt: "A simple blue square icon on white background.",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(String(payload?.error || "Image model test failed"));
      }
      toast.success(isZh ? "生图模型可用" : "Image model is working");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isZh ? "生图模型测试失败" : "Image model test failed");
    } finally {
      setImageTestState("idle");
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title={t(uiLang, "settings.buttonTitle")}
      >
        <Settings className="h-5 w-5" />
      </Button>

      {isOpen &&
        createPortal(
          <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 duration-200 backdrop-blur-sm">
            <div className="animate-in zoom-in-95 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border/50 bg-background shadow-2xl duration-200">
              <div className="flex items-center justify-between border-b border-border/50 bg-muted/10 p-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {t(uiLang, "settings.title")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(uiLang, "settings.subtitle")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-full hover:bg-muted/50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-5 overflow-y-auto p-6">
                <SectionCard
                  title={isZh ? "界面语言" : "Language"}
                  description={isZh ? "切换界面显示语言。" : "Switch the interface language."}
                >
                  <div className="flex w-fit items-center rounded-lg border border-border/60 bg-muted/10 p-1">
                    <Button
                      variant={uiLang === "zh" ? "secondary" : "ghost"}
                      className="h-8 rounded-md px-3"
                      onClick={() => setUiLangState("zh")}
                    >
                      {t(uiLang, "settings.language.zh")}
                    </Button>
                    <Button
                      variant={uiLang === "en" ? "secondary" : "ghost"}
                      className="h-8 rounded-md px-3"
                      onClick={() => setUiLangState("en")}
                    >
                      {t(uiLang, "settings.language.en")}
                    </Button>
                  </div>
                </SectionCard>

                <SectionCard
                  title={isZh ? "文本模型" : "Text Model"}
                  description={
                    isZh
                      ? "用于聊天、文本生成和图片理解。上传图片时会直接交给模型处理，由模型真实返回是否支持。"
                      : "Used for chat, text generation, and image understanding. Image uploads are sent directly to the model, which decides whether they are supported."
                  }
                  actions={
                    <TestButton
                      label={isZh ? "测试文本模型" : "Test Text Model"}
                      state={textTestState}
                      onClick={handleTestText}
                    />
                  }
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ProviderField
                      label="Provider"
                      value={config.textProvider}
                      onChange={(value) => handleProviderChange("text", value)}
                      options={TEXT_PROVIDER_OPTIONS}
                      docsUrl={textProviderLink}
                      uiLang={uiLang}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Model</label>
                      <input
                        type="text"
                        value={config.textModel}
                        onChange={(e) => setConfig({ ...config, textModel: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                    <SecretInput
                      label="API Key"
                      value={config.textApiKey}
                      onChange={(value) => setConfig({ ...config, textApiKey: value })}
                      placeholder="sk-..."
                      visible={showTextKey}
                      onToggle={() => setShowTextKey((prev) => !prev)}
                      docsUrl={textProviderLink}
                      uiLang={uiLang}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Base URL</label>
                      <input
                        type="text"
                        value={config.textBaseUrl}
                        onChange={(e) => setConfig({ ...config, textBaseUrl: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder="https://api.example.com/v1"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={isZh ? "生图模型" : "Image Model"}
                  description={
                    isZh
                      ? "仅用于图片生成，与文本模型完全独立。"
                      : "Used only for image generation and fully separate from the text model."
                  }
                  actions={
                    <TestButton
                      label={isZh ? "测试生图模型" : "Test Image Model"}
                      state={imageTestState}
                      onClick={handleTestImage}
                    />
                  }
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ProviderField
                      label="Provider"
                      value={config.imageProvider}
                      onChange={(value) => handleProviderChange("image", value)}
                      options={IMAGE_PROVIDER_OPTIONS}
                      docsUrl={imageProviderLink}
                      uiLang={uiLang}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Model</label>
                      <input
                        type="text"
                        value={config.imageModel}
                        onChange={(e) => setConfig({ ...config, imageModel: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder="gpt-image-1"
                      />
                    </div>
                    <SecretInput
                      label="API Key"
                      value={config.imageApiKey}
                      onChange={(value) => setConfig({ ...config, imageApiKey: value })}
                      placeholder="sk-..."
                      visible={showImageKey}
                      onToggle={() => setShowImageKey((prev) => !prev)}
                      docsUrl={imageProviderLink}
                      uiLang={uiLang}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Base URL</label>
                      <input
                        type="text"
                        value={config.imageBaseUrl}
                        onChange={(e) => setConfig({ ...config, imageBaseUrl: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder="https://api.example.com/v1"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={isZh ? "其他" : "Other"}
                  description={isZh ? "文件解析等辅助配置。" : "Auxiliary settings such as file parsing."}
                >
                  <SecretInput
                    label="MinerU Token"
                    value={config.fileParserApiToken || ""}
                    onChange={(value) => setConfig({ ...config, fileParserApiToken: value })}
                    placeholder={isZh ? "留空则使用本地解析" : "Leave empty to use local extraction"}
                    visible={showMineruKey}
                    onToggle={() => setShowMineruKey((prev) => !prev)}
                    docsUrl={MINERU_LINK}
                    uiLang={uiLang}
                  />
                </SectionCard>
              </div>

              <div className="flex justify-end gap-3 border-t border-border/50 bg-muted/5 p-4 px-6">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg hover:bg-muted"
                >
                  {t(uiLang, "common.cancel")}
                </Button>
                <Button onClick={handleSave} className="gap-2 rounded-lg shadow-sm">
                  <Save className="h-4 w-4" />
                  {t(uiLang, "common.save")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
