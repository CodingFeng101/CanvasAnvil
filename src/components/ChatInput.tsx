import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Send, FileText, ImageIcon, Paperclip, X, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ButtonWithTooltip } from '@/components/button-with-tooltip';
import { FilePreviewList } from '@/components/file-preview-list';
import { useFileProcessor } from '@/lib/use-file-processor';
import { toast } from 'sonner';

interface ChatInputProps {
    input: string;
    setInput: (value: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    onStop?: () => void;
    onFilesChange?: (files: File[]) => void;
    files?: File[]; // Controlled files
    onOpenGlobalConstraints?: () => void; // New prop for global constraints
    placeholder?: string;
}

export function ChatInput({
    input,
    setInput,
    onSubmit,
    isLoading,
    onStop,
    onFilesChange,
    files: controlledFiles,
    onOpenGlobalConstraints,
    placeholder
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    
    const { files, handleFileChange, setFiles, pdfData } = useFileProcessor();
    
    // Sync controlled files if provided
    useEffect(() => {
        if (controlledFiles) {
            setFiles(controlledFiles);
        }
    }, [controlledFiles, setFiles]);

    // Notify parent when files change
    useEffect(() => {
        onFilesChange?.(files);
    }, [files, onFilesChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isLoading) onStop?.();
            else onSubmit();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [input]);

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        const pastedFiles: File[] = [];
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) pastedFiles.push(file);
            }
        }

        if (pastedFiles.length > 0) {
            e.preventDefault();
            handleFileChange([...files, ...pastedFiles]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length > 0) {
            handleFileChange([...files, ...droppedFiles]);
        }
    };

    const handleImageUpload = () => imageInputRef.current?.click();
    const handleFileUpload = () => fileInputRef.current?.click();

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            handleFileChange([...files, ...Array.from(e.target.files)]);
            e.target.value = ''; // Reset
        }
    };

    const removeFile = (fileToRemove: File) => {
        setFiles(files.filter(f => f !== fileToRemove));
    };

    return (
        <div 
            className="relative rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl shadow-[0_10px_40px_-18px_rgba(0,0,0,0.35)] focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all duration-200"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                ref={imageInputRef}
                onChange={onFileInputChange}
            />
            <input
                type="file"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={onFileInputChange}
            />

            {files.length > 0 && (
                <div className="px-3 pt-3">
                    <FilePreviewList 
                        files={files} 
                        onRemoveFile={removeFile}
                        pdfData={pdfData}
                    />
                </div>
            )}

            <div className="flex items-end gap-2 px-2 pb-1 pt-1">
                <div className="flex-1 min-w-0 px-2">
                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder={placeholder || "输入…"}
                            className={cn(
                                "w-full resize-none bg-transparent border-none px-2 py-2 focus:ring-0 transition-all outline-none text-[15px] leading-6 max-h-[360px] overflow-y-auto min-h-[44px]"
                            )}
                            rows={1}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-1 pr-1">
                {onOpenGlobalConstraints && (
                    <ButtonWithTooltip
                        tooltipContent="规则"
                        variant="ghost"
                        size="icon"
                        onClick={onOpenGlobalConstraints}
                        className="h-9 w-9 text-muted-foreground hover:text-primary rounded-lg mr-1"
                    >
                        <Settings2 className="w-4 h-4" />
                    </ButtonWithTooltip>
                )}

                <ButtonWithTooltip
                    tooltipContent="上传图片"
                    variant="ghost"
                    size="icon"
                    onClick={handleImageUpload}
                    className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-lg"
                >
                    <ImageIcon className="w-5 h-5" />
                </ButtonWithTooltip>
                
                <ButtonWithTooltip
                    tooltipContent="上传文件"
                    variant="ghost"
                    size="icon"
                    onClick={handleFileUpload}
                    className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-lg"
                >
                    <FileText className="w-5 h-5" />
                </ButtonWithTooltip>

                <Button
                    onClick={isLoading ? onStop : onSubmit}
                    disabled={isLoading ? !onStop : (!input.trim() && files.length === 0)}
                    size="icon"
                    className={cn(
                        "h-9 w-9 rounded-xl transition-all duration-200 ml-1",
                        (input.trim() || files.length > 0)
                            ? "bg-primary text-primary-foreground shadow-md hover:scale-105 hover:bg-primary/90"
                            : "bg-muted text-muted-foreground"
                    )}
                >
                    {isLoading ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </Button>
            </div>
        </div>
        </div>
    );
}
