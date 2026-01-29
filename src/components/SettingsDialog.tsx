import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Save } from 'lucide-react';
import { getAIConfig, saveAIConfig, AIConfig } from '@/lib/ai-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<AIConfig>(getAIConfig());

  // Reload config when dialog opens
  useEffect(() => {
    if (isOpen) {
      setConfig(getAIConfig());
    }
  }, [isOpen]);

  const handleSave = () => {
    saveAIConfig(config);
    setIsOpen(false);
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => setIsOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        title="设置"
      >
        <Settings className="w-5 h-5" />
      </Button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md border border-border/50 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border/50 bg-muted/10">
              <div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight">配置设置</h2>
                <p className="text-xs text-muted-foreground mt-1">配置 AI 模型参数与 API 密钥</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8 rounded-full hover:bg-muted/50">
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto">
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
                  <label className="text-sm font-medium text-foreground">对话模型 (Chat Model)</label>
                  <input 
                    type="text" 
                    value={config.chatModel}
                    onChange={(e) => setConfig({...config, chatModel: e.target.value})}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                    placeholder="gpt-3.5-turbo"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">绘图模型 (Image Model)</label>
                  <input 
                    type="text" 
                    value={config.imageModel}
                    onChange={(e) => setConfig({...config, imageModel: e.target.value})}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm"
                    placeholder="gemini-2.5-flash-image-preview"
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
                取消
              </Button>
              <Button 
                onClick={handleSave}
                className="gap-2 rounded-lg shadow-sm"
              >
                <Save className="w-4 h-4" />
                保存
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
