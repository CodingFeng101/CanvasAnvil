"use client"

import Image from "@/shared/ui/image"
import { useState } from "react"
import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { useDiagram } from "@/workspaces/diagram/state/diagram-context"
import { useDiagramT } from "@/workspaces/diagram/lib/translations"

interface HistoryDialogProps {
    showHistory: boolean
    onToggleHistory: (show: boolean) => void
}

export function HistoryDialog({
    showHistory,
    onToggleHistory,
}: HistoryDialogProps) {
    const { diagramHistory, loadDiagram: onDisplayChart } = useDiagram()
    const t = useDiagramT()
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const handleClose = () => {
        setSelectedIndex(null)
        onToggleHistory(false)
    }

    const handleConfirmRestore = () => {
        if (selectedIndex !== null) {
            // Skip validation for trusted history snapshots
            onDisplayChart(diagramHistory[selectedIndex].xml, true)
            handleClose()
        }
    }

    return (
        <Dialog open={showHistory} onOpenChange={onToggleHistory}>
            <DialogContent className="flex h-[min(760px,calc(100vh-3rem))] flex-col overflow-hidden sm:max-w-[min(68rem,calc(100%-2rem))]">
                <DialogHeader>
                    <DialogTitle>{t("history.title")}</DialogTitle>
                </DialogHeader>

                {diagramHistory.length === 0 ? (
                    <div className="text-center p-4 text-muted-foreground">
                        {t("history.empty")}
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-4 overflow-y-auto py-4 pr-1 md:grid-cols-3 lg:grid-cols-4">
                        {diagramHistory.map((item, index) => (
                            <div
                                key={index}
                                className={`border rounded-md p-2 cursor-pointer hover:border-primary transition-colors ${
                                    selectedIndex === index
                                        ? "border-primary ring-2 ring-primary"
                                        : ""
                                }`}
                                onClick={() => setSelectedIndex(index)}
                            >
                                <div className="aspect-video bg-white rounded overflow-hidden flex items-center justify-center">
                                    <Image
                                        src={item.svg}
                                        alt={`Diagram version ${index + 1}`}
                                        width={200}
                                        height={100}
                                        className="object-contain w-full h-full p-1"
                                    />
                                </div>
                                <div className="text-xs text-center mt-1 text-muted-foreground">
                                    {t("history.version")} {index + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    {selectedIndex !== null ? (
                        <>
                            <div className="flex-1 text-sm text-muted-foreground">
                                {t("history.restore")} {selectedIndex + 1}?
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => setSelectedIndex(null)}
                            >
                                {t("history.cancel")}
                            </Button>
                            <Button onClick={handleConfirmRestore}>
                                {t("history.confirm")}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" onClick={handleClose}>
                            {t("history.close")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

