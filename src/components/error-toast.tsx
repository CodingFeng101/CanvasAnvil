import { XCircle, X } from "lucide-react"
import type React from "react"

interface ErrorToastProps {
    message: React.ReactNode
    onDismiss: () => void
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
    return (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 shadow-lg w-full max-w-md relative">
            <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium">{message}</div>
            <button
                onClick={onDismiss}
                className="absolute top-2 right-2 p-1 hover:bg-destructive/10 rounded-full transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
