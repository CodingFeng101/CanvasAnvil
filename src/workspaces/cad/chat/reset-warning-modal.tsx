import React from 'react';
import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { t, useUiLanguage } from "@/shared/i18n";

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
