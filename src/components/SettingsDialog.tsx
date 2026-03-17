import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Save } from 'lucide-react';
import { getAIConfig, saveAIConfig, AIConfig } from '@/lib/ai-client';
import { Button } from '@/components/ui/button';
import { getUiLanguage, setUiLanguage, type UiLanguage } from "@/lib/ui-language";
import { t } from "@/lib/i18n";

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<AIConfig>(getAIConfig());
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getUiLanguage());

  // Reload config when dialog opens
  useEffect(() => {
    if (isOpen) {
      setConfig(getAIConfig());
      setUiLang(getUiLanguage());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setUiLanguage(uiLang);
  }, [uiLang, isOpen]);

  const handleSave = () => {
    saveAIConfig(config);
    setUiLanguage(uiLang);
    setIsOpen(false);
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
        <Settings className="w-5 h-5" />
      </Button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md border border-border/50 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border/50 bg-muted/10">
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">{t(uiLang, "settings.title")}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t(uiLang, "settings.subtitle")}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8 rounded-full hover:bg-muted/50">
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{t(uiLang, "settings.language")}</div>
                <div className="flex items-center rounded-lg border border-border/60 bg-muted/10 p-1">
                  <Button
                    variant={uiLang === "zh" ? "secondary" : "ghost"}
                    className="h-8 px-3 rounded-md"
                    onClick={() => setUiLang("zh")}
                  >
                    {t(uiLang, "settings.language.zh")}
                  </Button>
                  <Button
                    variant={uiLang === "en" ? "secondary" : "ghost"}
                    className="h-8 px-3 rounded-md"
                    onClick={() => setUiLang("en")}
                  >
                    {t(uiLang, "settings.language.en")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  API Key
                  <span className="text-xs text-muted-foreground font-normal">(Authorization)</span>
                </label>
                <input 
                  type="password" 
                  value={config.apiKey}
                  onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                  placeholder="sk-..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Base URL</label>
                <input 
                  type="text" 
                  value={config.baseUrl}
                  onChange={(e) => setConfig({...config, baseUrl: e.target.value})}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 pt-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t(uiLang, "settings.chatModel")}</label>
                  <input 
                    type="text" 
                    value={config.chatModel}
                    onChange={(e) => setConfig({...config, chatModel: e.target.value})}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                    placeholder="gpt-3.5-turbo"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t(uiLang, "settings.imageModel")}</label>
                  <input 
                    type="text" 
                    value={config.imageModel}
                    onChange={(e) => setConfig({...config, imageModel: e.target.value})}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                    placeholder="gemini-2.5-flash-image-preview"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    MinerU Token (optional)
                    <a
                      href="https://mineru.net/"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-blue-600 hover:text-blue-500 underline underline-offset-2 font-normal"
                    >
                      Get token
                    </a>
                  </label>
                  <input
                    type="password"
                    value={config.fileParserApiToken || ""}
                    onChange={(e) => setConfig({ ...config, fileParserApiToken: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                    placeholder="Leave empty to use local extraction (default)"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 px-6 border-t border-border/50 flex justify-end gap-3 bg-muted/5">
              <Button 
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="rounded-lg hover:bg-muted"
              >
                {t(uiLang, "common.cancel")}
              </Button>
              <Button 
                onClick={handleSave}
                className="gap-2 rounded-lg shadow-sm"
              >
                <Save className="w-4 h-4" />
                {t(uiLang, "common.save")}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
