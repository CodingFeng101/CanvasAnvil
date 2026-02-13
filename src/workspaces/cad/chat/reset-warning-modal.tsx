import React from 'react';
import { Button } from "@/workspaces/cad/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/workspaces/cad/ui/dialog"
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";

interface ResetWarningModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onClear: () => void
}

export function ResetWarningModal({
    open,
    onOpenChange,
    onClear,
}: ResetWarningModalProps) {
    const uiLang = useUiLanguage();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t(uiLang, "reset.title")}</DialogTitle>
                    <DialogDescription>
                        {t(uiLang, "reset.desc")}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} title={t(uiLang, "common.cancel")}>
                        {t(uiLang, "common.cancel")}
                    </Button>
                    <Button variant="destructive" onClick={onClear} title={t(uiLang, "common.clear")}>
                        {t(uiLang, "common.clear")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
