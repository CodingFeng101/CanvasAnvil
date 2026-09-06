import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Eye, EyeOff, Loader2, Save, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { normalizeAIConfig } from "@contracts/ai";
import { getAIConfig, saveAIConfig } from "@/ai/storage";
import type { AIConfig } from "@contracts/ai";
import { Button } from "@/shared/ui/button";
import { getUiLanguage, setUiLanguage, t, type UiLanguage } from "@/shared/i18n";

/**
 * Model settings.
 *
 * Every model is reached over the OpenAI HTTP protocol, so a channel is fully
 * described by base URL + key + model name. Pointing the base URL at a
 * vendor's OpenAI-compatible endpoint is all that switching providers takes;
 * there is no provider list to keep in sync.
 */

const MINERU_LINK = "https://mineru.net/";
const OPENAI_KEYS_LINK = "https://platform.openai.com/api-keys";

type ChannelKey = "text" | "image";
type TestState = "idle" | "testing";

const CHANNEL_FIELDS = {
  text: { apiKey: "textApiKey", baseUrl: "textBaseUrl", model: "textModel" },
  image: { apiKey: "imageApiKey", baseUrl: "imageBaseUrl", model: "imageModel" },
} as const satisfies Record<ChannelKey, Record<"apiKey" | "baseUrl" | "model", keyof AIConfig>>;

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

const inputClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        placeholder={placeholder}
      />
    </div>
  );
}

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
  docsUrl,
  uiLang,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  docsUrl?: string;
  uiLang: UiLanguage;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary-strong hover:underline"
          >
            {uiLang === "zh" ? "获取 Key" : "Get Key"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-10`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? "Hide secret" : "Show secret"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ChannelCard({
  channel,
  title,
  description,
  modelPlaceholder,
  testLabel,
  config,
  onChange,
  onTest,
  testState,
  uiLang,
}: {
  channel: ChannelKey;
  title: string;
  description: string;
  modelPlaceholder: string;
  testLabel: string;
  config: AIConfig;
  onChange: (patch: Partial<AIConfig>) => void;
  onTest: () => void;
  testState: TestState;
  uiLang: UiLanguage;
}) {
  const fields = CHANNEL_FIELDS[channel];
  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg"
          onClick={onTest}
          disabled={testState === "testing"}
        >
          {testState === "testing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {testLabel}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="Model"
          value={config[fields.model]}
          onChange={(value) => onChange({ [fields.model]: value } as Partial<AIConfig>)}
          placeholder={modelPlaceholder}
        />
        <TextField
          label="Base URL"
          value={config[fields.baseUrl]}
          onChange={(value) => onChange({ [fields.baseUrl]: value } as Partial<AIConfig>)}
          placeholder="https://api.openai.com/v1"
        />
        <SecretInput
          label="API Key"
          value={config[fields.apiKey]}
          onChange={(value) => onChange({ [fields.apiKey]: value } as Partial<AIConfig>)}
          placeholder="sk-..."
          docsUrl={OPENAI_KEYS_LINK}
          uiLang={uiLang}
        />
      </div>
    </SectionCard>
  );
}

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<AIConfig>(() => getAIConfig());
  const [uiLang, setUiLangState] = useState<UiLanguage>(() => getUiLanguage());
  const [testState, setTestState] = useState<Record<ChannelKey, TestState>>({ text: "idle", image: "idle" });

  useEffect(() => {
    if (!isOpen) return;
    setConfig(getAIConfig());
    setUiLangState(getUiLanguage());
    setTestState({ text: "idle", image: "idle" });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setUiLanguage(uiLang);
  }, [uiLang, isOpen]);

  const isZh = uiLang === "zh";
  const patch = (values: Partial<AIConfig>) => setConfig((prev) => ({ ...prev, ...values }));

  /** Send one real request through the same proxy the workspaces use. */
  const testChannel = async (channel: ChannelKey) => {
    const normalized = normalizeAIConfig(config);
    const fields = CHANNEL_FIELDS[channel];
    if (!normalized[fields.apiKey] || !normalized[fields.baseUrl] || !normalized[fields.model]) {
      toast.error(
        isZh ? "请先填写 Model、Base URL 和 API Key" : "Please fill model, base URL, and API key first",
      );
      return;
    }

    setTestState((prev) => ({ ...prev, [channel]: "testing" }));
    try {
      const response = await fetch("/api/ppt-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "text"
            ? { kind: "chat", aiConfig: normalized, messages: [{ role: "user", content: "Reply with OK only." }] }
            : { kind: "image", aiConfig: normalized, prompt: "A simple blue square icon on white background." },
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || (channel === "image" && !payload?.url)) {
        throw new Error(String(payload?.error || "Model test failed"));
      }
      toast.success(isZh ? "模型可用" : "Model is working");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isZh ? "模型测试失败" : "Model test failed");
    } finally {
      setTestState((prev) => ({ ...prev, [channel]: "idle" }));
    }
  };

  const handleSave = () => {
    saveAIConfig(config);
    setUiLanguage(uiLang);
    setIsOpen(false);
    toast.success(isZh ? "配置已保存" : "Settings saved");
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
          <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-overlay/45 p-4 duration-base backdrop-blur-sm">
            <div className="animate-in zoom-in-95 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border/50 bg-background shadow-2xl duration-200">
              <div className="flex items-center justify-between border-b border-border/50 bg-muted/10 p-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    {t(uiLang, "settings.title")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{t(uiLang, "settings.subtitle")}</p>
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

                <ChannelCard
                  channel="text"
                  title={isZh ? "文本模型" : "Text Model"}
                  description={
                    isZh
                      ? "用于聊天、文本生成和图片理解。任何 OpenAI 兼容端点都可以，把 Base URL 指过去即可。"
                      : "Used for chat, text generation, and image understanding. Any OpenAI-compatible endpoint works — just point the base URL at it."
                  }
                  modelPlaceholder="gpt-4o-mini"
                  testLabel={isZh ? "测试文本模型" : "Test Text Model"}
                  config={config}
                  onChange={patch}
                  onTest={() => testChannel("text")}
                  testState={testState.text}
                  uiLang={uiLang}
                />

                <ChannelCard
                  channel="image"
                  title={isZh ? "生图模型" : "Image Model"}
                  description={
                    isZh
                      ? "仅用于图片生成，与文本模型完全独立。"
                      : "Used only for image generation and fully separate from the text model."
                  }
                  modelPlaceholder="gpt-image-1"
                  testLabel={isZh ? "测试生图模型" : "Test Image Model"}
                  config={config}
                  onChange={patch}
                  onTest={() => testChannel("image")}
                  testState={testState.image}
                  uiLang={uiLang}
                />

                <SectionCard
                  title={isZh ? "其他" : "Other"}
                  description={isZh ? "文件解析等辅助配置。" : "Auxiliary settings such as file parsing."}
                >
                  <SecretInput
                    label="MinerU Token"
                    value={config.fileParserApiToken}
                    onChange={(value) => patch({ fileParserApiToken: value })}
                    placeholder={isZh ? "留空则使用本地解析" : "Leave empty to use local extraction"}
                    docsUrl={MINERU_LINK}
                    uiLang={uiLang}
                  />
                </SectionCard>
              </div>

              <div className="flex justify-end gap-3 border-t border-border/50 bg-muted/5 p-4 px-6">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="rounded-lg hover:bg-muted">
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
