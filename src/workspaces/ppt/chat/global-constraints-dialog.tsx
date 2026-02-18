import { useEffect, useState } from "react"
import { Button } from "@/workspaces/ppt/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/workspaces/ppt/ui/dialog"
import { Textarea } from "@/workspaces/ppt/ui/textarea"
import { useUiLanguage } from "@/lib/use-ui-language";
import { t } from "@/lib/i18n";

export const STORAGE_GLOBAL_CONSTRAINTS_KEY = "CanvasAnvil-global-constraints"

interface GlobalConstraintsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    workspaceId?: string // Optional workspace ID to scope constraints
}

export function GlobalConstraintsDialog({
    open,
    onOpenChange,
    workspaceId
}: GlobalConstraintsDialogProps) {
    const [constraints, setConstraints] = useState("")
    const uiLang = useUiLanguage();
    const workspaceLabel =
        workspaceId === "flow"
            ? "Flow"
            : workspaceId === "cad"
              ? "CAD"
              : workspaceId === "ppt"
                ? "PPT"
                : "General"
    
    // Determine the actual storage key
    const storageKey = workspaceId 
        ? `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}` 
        : STORAGE_GLOBAL_CONSTRAINTS_KEY;

    useEffect(() => {
        if (open) {
            const saved = localStorage.getItem(storageKey) || ""
            setConstraints(saved)
        }
    }, [open, storageKey])

    const handleSave = () => {
        localStorage.setItem(storageKey, constraints)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {t(uiLang, "constraints.title")} ({workspaceLabel})
                    </DialogTitle>
                    <DialogDescription>
                        {t(uiLang, "constraints.desc")}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        value={constraints}
                        onChange={(e) => setConstraints(e.target.value)}
                        placeholder={t(uiLang, "constraints.placeholder")}
                        className="min-h-[200px]"
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>
                        {t(uiLang, "common.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

