"use client"

import { HistoryDialog as SharedHistoryDialog, type HistoryItem } from "@/shared/chat/history-dialog"
import { useDiagram } from "@/workspaces/diagram/state/diagram-context"
import { useDiagramT } from "@/workspaces/diagram/lib/translations"

interface HistoryDialogProps {
    showHistory: boolean
    onToggleHistory: (show: boolean) => void
}

/** The diagram's snapshots in the shared history dialog, oldest first. */
export function HistoryDialog({ showHistory, onToggleHistory }: HistoryDialogProps) {
    const { diagramHistory, loadDiagram: onDisplayChart } = useDiagram()
    const t = useDiagramT()
    const items: HistoryItem[] = diagramHistory.map((item, index) => ({
        id: String(index),
        content: item.xml,
        type: "xml",
        image: item.svg || undefined,
    }))

    return (
        <SharedHistoryDialog
            showHistory={showHistory}
            onToggleHistory={onToggleHistory}
            history={items}
            title={t("history.title")}
            empty={t("history.empty")}
            // Skip validation for trusted history snapshots.
            onRestore={(item) => void onDisplayChart(item.content, true)}
        />
    )
}
