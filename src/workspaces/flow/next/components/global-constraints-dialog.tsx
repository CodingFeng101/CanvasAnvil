"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/workspaces/flow/next/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/workspaces/flow/next/components/ui/dialog"
import { Textarea } from "@/workspaces/flow/next/components/ui/textarea"
import { useLanguage } from "@/workspaces/flow/next/contexts/language-context"

export const STORAGE_GLOBAL_CONSTRAINTS_KEY = "next-ai-draw-io-global-constraints"

interface GlobalConstraintsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function GlobalConstraintsDialog({
    open,
    onOpenChange,
}: GlobalConstraintsDialogProps) {
    const { t } = useLanguage()
    const [constraints, setConstraints] = useState("")

    useEffect(() => {
        if (open) {
            const saved = localStorage.getItem(STORAGE_GLOBAL_CONSTRAINTS_KEY) || ""
            setConstraints(saved)
        }
    }, [open])

    const handleSave = () => {
        localStorage.setItem(STORAGE_GLOBAL_CONSTRAINTS_KEY, constraints)
        toast.success(t("common.saved"), {
            position: "top-center",
            duration: 2000,
        })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t("global_constraints.title")}</DialogTitle>
                    <DialogDescription>
                        {t("global_constraints.description")}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        value={constraints}
                        onChange={(e) => setConstraints(e.target.value)}
                        placeholder={t("global_constraints.placeholder")}
                        className="min-h-[200px]"
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>
                        {t("common.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

