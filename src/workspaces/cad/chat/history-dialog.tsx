import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/workspaces/cad/ui/dialog"
import { Button } from '@/workspaces/cad/ui/button';
import { Clock, RotateCcw, FileCode, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/workspaces/cad/ui/scroll-area';
import { useUiLanguage } from "@/lib/use-ui-language";
import { t } from "@/lib/i18n";

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

export function HistoryDialog({
    showHistory,
    onToggleHistory,
    history,
    onRestore,
    onClear,
}: HistoryDialogProps) {
    const uiLang = useUiLanguage();
    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleString();
    };

    return (
        <Dialog open={showHistory} onOpenChange={onToggleHistory}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3">
                        <DialogTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                            {t(uiLang, "history.title")}
                        </DialogTitle>
                        {history.length > 0 && onClear && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={onClear}
                                className="gap-1 text-xs"
                                title={t(uiLang, "history.clear")}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {t(uiLang, "history.clear")}
                            </Button>
                        )}
                    </div>
                </DialogHeader>
                
                <div className="flex-1 overflow-hidden mt-2">
                    {history.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
                            <Clock className="w-8 h-8 opacity-20" />
                            <p>{t(uiLang, "history.empty")}</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[400px] pr-4">
                            <div className="space-y-3">
                                {[...history].reverse().map((item, index) => (
                                    <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-between group">
                                        <div className="flex flex-col gap-1 overflow-hidden">
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-xs">
                                                    {history.length - index}
                                                </span>
                                                <span>{formatDate(item.timestamp)}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate pl-8 flex items-center gap-1">
                                                <FileCode className="w-3 h-3" />
                                                <span>{item.type.toUpperCase()}</span>
                                                <span>•</span>
                                                <span>{t(uiLang, "history.chars", { n: item.content.length })}</span>
                                            </div>
                                        </div>
                                        
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            onClick={() => {
                                                onRestore(item);
                                                onToggleHistory(false);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-xs"
                                            title={t(uiLang, "history.restore")}
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            {t(uiLang, "history.restore")}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
