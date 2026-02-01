import React, { useState } from 'react';
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useUiLanguage } from "@/lib/use-ui-language";
import { t } from "@/lib/i18n";

interface SaveDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (filename: string, format: string) => void
    defaultFilename?: string
}

export function SaveDialog({
    open,
    onOpenChange,
    onSave,
    defaultFilename = "diagram",
}: SaveDialogProps) {
    const [filename, setFilename] = useState(defaultFilename)
    const [format, setFormat] = useState("xml")
    const uiLang = useUiLanguage();

    const handleSave = () => {
        onSave(filename, format)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t(uiLang, "saveDialog.title")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="filename" className="text-right">
                            {t(uiLang, "saveDialog.filename")}
                        </Label>
                        <Input
                            id="filename"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="format" className="text-right">
                            {t(uiLang, "saveDialog.format")}
                        </Label>
                        <Select value={format} onValueChange={setFormat}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder={t(uiLang, "saveDialog.chooseFormat")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="xml">XML (Draw.io)</SelectItem>
                                <SelectItem value="svg">SVG</SelectItem>
                                <SelectItem value="png">PNG</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>{t(uiLang, "common.save")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
