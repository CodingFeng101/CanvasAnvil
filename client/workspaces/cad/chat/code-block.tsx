import { Cpu } from "lucide-react";
import { CodeCard, type ApplyCode } from "@/shared/chat/code-card";
import { useUiLanguage } from "@/shared/i18n";

interface CodeBlockProps {
    code: string;
    language?: string;
    isStreaming?: boolean;
    blockId?: string;
    onApply?: ApplyCode;
}

/** The CAD canvas's framing of the shared code card. */
export function CodeBlock({
    code,
    language = "xml",
    isStreaming = false,
    blockId,
    onApply,
}: CodeBlockProps) {
    const uiLang = useUiLanguage();
    return (
        <CodeCard
            code={code}
            language={language}
            isStreaming={isStreaming}
            blockId={blockId}
            onApply={onApply}
            icon={<Cpu className="h-3.5 w-3.5" />}
            title={uiLang === "zh" ? "生成 CAD" : "Generate CAD"}
        />
    );
}
