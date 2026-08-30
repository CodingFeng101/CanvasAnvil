import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { t, useUiLanguage } from "@/shared/i18n"

/**
 * Confirmation before a destructive clear.
 *
 * Labels are overridable because what gets cleared differs per workspace —
 * Flow drops the diagram along with the conversation, the others only the
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
    const title = labels?.title ?? t(uiLang, "reset.title")
    const description = labels?.description ?? t(uiLang, "reset.desc")
    const cancel = labels?.cancel ?? t(uiLang, "common.cancel")
    const confirm = labels?.confirm ?? t(uiLang, "common.clear")

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
