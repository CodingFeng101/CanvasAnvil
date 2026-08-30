import { useEffect, useState } from "react"
import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { Textarea } from "@/shared/ui/textarea"
import { t, useUiLanguage } from "@/shared/i18n"

/**
 * Standing instructions the workspace prepends to every request.
 *
 * Constraints are scoped per workspace: a CAD drawing convention has no place
 * in a slide deck. Flow passes an explicit storageKey to keep reading the key
 * it shipped with, so nobody's saved constraints disappear.
 */
export const STORAGE_GLOBAL_CONSTRAINTS_KEY = "CanvasAnvil-global-constraints"

const WORKSPACE_LABELS: Record<string, string> = {
    flow: "Flow",
    cad: "CAD",
    ppt: "PPT",
}

interface GlobalConstraintsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Scopes the constraints; also names the workspace in the title. */
    workspaceId?: string
    /** Overrides the derived key. Only needed for a pre-existing key. */
    storageKey?: string
}

export function GlobalConstraintsDialog({
    open,
    onOpenChange,
    workspaceId,
    storageKey: storageKeyOverride,
}: GlobalConstraintsDialogProps) {
    const [constraints, setConstraints] = useState("")
    const uiLang = useUiLanguage()

    const workspaceLabel = (workspaceId && WORKSPACE_LABELS[workspaceId]) || "General"
    const storageKey =
        storageKeyOverride ??
        (workspaceId
            ? `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}`
            : STORAGE_GLOBAL_CONSTRAINTS_KEY)

    useEffect(() => {
        if (!open) return
        setConstraints(localStorage.getItem(storageKey) || "")
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
                    <DialogDescription>{t(uiLang, "constraints.desc")}</DialogDescription>
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
                    <Button onClick={handleSave} title={t(uiLang, "common.save")}>
                        {t(uiLang, "common.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
