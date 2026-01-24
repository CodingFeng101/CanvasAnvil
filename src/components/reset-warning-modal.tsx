import React from 'react';
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

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
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>清空对话</DialogTitle>
                    <DialogDescription>
                        确定要清空所有对话记录吗？此操作无法撤销。
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button variant="destructive" onClick={onClear}>
                        清空
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
