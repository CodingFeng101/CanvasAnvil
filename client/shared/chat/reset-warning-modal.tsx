import { Button } from "@/shared/ui/button"
import { useEffect } from "react"
import { usePreferences } from "@/shared/preferences"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { t, useUiLanguage } from "@/shared/i18n"
import { useWork } from "@/shared/works/work-context"

/**
 * Confirmation before a destructive clear.
 *
 * Labels are overridable because what gets cleared differs per workspace —
 * Diagram drops the diagram along with the conversation, the others only the
 * conversation — and the wording has to say so.
 */
export interface ResetWarningLabels {
    title?: string
    description?: string
    cancel?: string
    confirm?: string
}

interface ResetWarningModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onClear: () => void
    labels?: ResetWarningLabels
}

export function ResetWarningModal({
    open,
    onOpenChange,
    onClear,
    labels,
}: ResetWarningModalProps) {
    const uiLang = useUiLanguage()
    // In the app every work with content is kept on its own, so nothing is lost and "cannot be undone" would be wrong.
    const saved = !!useWork()
    const title = labels?.title ?? t(uiLang, "reset.title")
    const description = saved ? t(uiLang, "reset.descSaved") : labels?.description ?? t(uiLang, "reset.desc")
    const cancel = labels?.cancel ?? t(uiLang, "common.cancel")
    const confirm = labels?.confirm ?? t(uiLang, "common.clear")
    // Settings → General can skip the question: clear straight away.
    const ask = usePreferences().confirmClear
    useEffect(() => {
        if (open && !ask) onClear()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, ask])
    if (!ask) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} title={cancel}>
                        {cancel}
                    </Button>
                    <Button variant="destructive" onClick={onClear} title={confirm}>
                        {confirm}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
