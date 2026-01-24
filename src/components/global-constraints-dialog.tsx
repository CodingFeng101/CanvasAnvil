import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

export const STORAGE_GLOBAL_CONSTRAINTS_KEY = "unified-ai-workspace-global-constraints"

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
                    <DialogTitle>全局规则约束 ({workspaceId === 'flow' ? '流程图' : workspaceId === 'cad' ? 'CAD设计' : workspaceId === 'ppt' ? 'PPT演示' : '通用'})</DialogTitle>
                    <DialogDescription>
                        设置适用于当前工作区的全局系统提示词。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        value={constraints}
                        onChange={(e) => setConstraints(e.target.value)}
                        placeholder="例如：始终使用中文回答，代码注释必须详细..."
                        className="min-h-[200px]"
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleSave}>
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
