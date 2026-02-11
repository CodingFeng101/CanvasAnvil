"use client"

import { FaCoffee } from "react-icons/fa"
import { useLanguage } from "@/workspaces/flow/next/contexts/language-context"

interface QuotaLimitToastProps {
    limit: number
    used: number
}

export function QuotaLimitToast({
    limit,
    used,
}: QuotaLimitToastProps) {
    const { t } = useLanguage()
    const percentage = Math.min((used / limit) * 100, 100)

    return (
        <div className="flex flex-col gap-3 w-full max-w-sm bg-background border border-border shadow-lg rounded-xl p-4 animate-in slide-in-from-bottom-5 duration-300">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-foreground">
                        {t("quota.limit.reached")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t("quota.limit.desc").replace("{limit}", limit.toString())}
                    </p>
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 shrink-0">
                    <span className="text-xs font-bold">!</span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Info text */}
            <div className="text-xs text-muted-foreground space-y-2">
                <p>
                    {t("quota.limit.tip")}
                </p>
                <p>{t("quota.limit.reset")}</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
                <a
                    href="https://github.com/sponsors/DayuanJiang"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                    <FaCoffee className="w-3.5 h-3.5" />
                    {t("quota.sponsor")}
                </a>
            </div>
        </div>
    )
}

