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

    const handleSave = () => {
        onSave(filename, format)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>保存图表</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="filename" className="text-right">
                            文件名
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
                            格式
                        </Label>
                        <Select value={format} onValueChange={setFormat}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="选择格式" />
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
                    <Button onClick={handleSave}>保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
