import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from '@/shared/ui/button';
import { Clock, RotateCcw, FileCode, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { t, useUiLanguage } from "@/shared/i18n";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useState } from "react";

export interface HistoryItem {
    id: string;
    timestamp: number;
    content: string; // XML or code
    type: 'xml' | 'python' | 'json' | 'svg';
    summary?: string;
}

interface HistoryDialogProps {
    showHistory: boolean;
    onToggleHistory: (show: boolean) => void;
    history: HistoryItem[];
    onRestore: (item: HistoryItem) => void;
    onClear?: () => void;
}

/** What a version looks like, small: its picture when it has one, else a slide with its title. */
function versionPreview(item: HistoryItem): { image?: string; title?: string } {
    if (item.type === "svg") return { image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.content)}` };
    if (/^(data:image\/|https?:\/\/)/.test(item.content.trim())) return { image: item.content.trim() };
    try {
        const data = JSON.parse(item.content);
        const slides: Array<Record<string, unknown>> = Array.isArray(data) ? data : Array.isArray(data?.slides) ? data.slides : [data];
        const first = slides.find((slide) => slide && typeof slide === "object") ?? {};
        const image = slides.map((slide) => slide?.imageUrl).find((url): url is string => typeof url === "string" && !!url);
        const title = [first.title, data?.title].find((v): v is string => typeof v === "string" && !!v.trim());
        return { image, title };
    } catch {
        return { title: item.summary };
    }
}

export function HistoryDialog({
    showHistory,
    onToggleHistory,
    history,
    onRestore,
    onClear,
}: HistoryDialogProps) {
    const uiLang = useUiLanguage();
    const zh = uiLang === "zh";
    const [confirmClear, setConfirmClear] = useState(false);
    const formatDate = (ts: number) => new Date(ts).toLocaleString();

    return (
        <Dialog open={showHistory} onOpenChange={onToggleHistory}>
            <DialogContent className="flex h-[min(760px,calc(100vh-3rem))] flex-col overflow-hidden sm:max-w-[min(68rem,calc(100%-2rem))]">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3 pr-8">
                        <DialogTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                            {t(uiLang, "history.title")}
                        </DialogTitle>
                        {history.length > 0 && onClear && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} className="gap-1 text-xs">
                                <Trash2 className="h-3.5 w-3.5" />
                                {t(uiLang, "history.clear")}
                            </Button>
                        )}
                    </div>
                </DialogHeader>
                <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                            <Clock className="h-8 w-8 opacity-20" />
                            <p>{t(uiLang, "history.empty")}</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-full pr-3">
                            <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 lg:grid-cols-4">
                                {[...history].reverse().map((item, index) => {
                                    const preview = versionPreview(item);
                                    return (
                                        <div key={item.id} className="group overflow-hidden rounded-xl border border-border/80 bg-card transition-[border-color,box-shadow] duration-fast hover:border-foreground/20 hover:shadow-[0_4px_16px_hsl(var(--shadow-hue)/0.06)]">
                                            <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-border/60 bg-sunken">
                                                {preview.image ? (
                                                    <img src={preview.image} alt="" className="size-full object-contain" draggable={false} />
                                                ) : preview.title ? (
                                                    <div className="m-3 flex aspect-video w-[80%] flex-col justify-center gap-1.5 rounded-md border border-border/70 bg-card px-3 shadow-sm">
                                                        <div className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground">{preview.title}</div>
                                                        <div className="h-1 w-2/3 rounded-full bg-foreground/10" />
                                                        <div className="h-1 w-1/2 rounded-full bg-foreground/10" />
                                                    </div>
                                                ) : (
                                                    <FileCode className="h-6 w-6 text-muted-foreground/50" />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onRestore(item);
                                                        onToggleHistory(false);
                                                    }}
                                                    className="absolute inset-0 flex items-center justify-center gap-1.5 bg-foreground/0 text-[13px] font-medium text-transparent transition-colors duration-fast group-hover:bg-foreground/40 group-hover:text-background"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                    {t(uiLang, "history.restore")}
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[12px]">
                                                <span className="font-medium text-foreground">{uiLang === "zh" ? `版本 ${history.length - index}` : `Version ${history.length - index}`}</span>
                                                <span className="truncate text-muted-foreground">{formatDate(item.timestamp)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
            <ConfirmDialog
                open={confirmClear}
                onOpenChange={setConfirmClear}
                title={zh ? "清空历史版本？" : "Clear version history?"}
                description={zh ? `${history.length} 个历史版本会被删除，无法找回。当前画布不受影响。` : `${history.length} saved versions will be deleted for good. The canvas itself stays as it is.`}
                confirmLabel={zh ? "清空" : "Clear"}
                cancelLabel={zh ? "取消" : "Cancel"}
                onConfirm={() => onClear?.()}
            />
        </Dialog>
    )
}
