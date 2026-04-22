"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { getAIConfig as getWorkspaceAIConfig } from "@/lib/ai-client"
import { Button } from "@/workspaces/flow/next/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/workspaces/flow/next/components/ui/dialog"
import { Input } from "@/workspaces/flow/next/components/ui/input"
import { Label } from "@/workspaces/flow/next/components/ui/label"
import { Switch } from "@/workspaces/flow/next/components/ui/switch"
import { useLanguage } from "@/workspaces/flow/next/contexts/language-context"

interface SettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCloseProtectionChange?: (enabled: boolean) => void
    drawioUi: "min" | "sketch"
    onToggleDrawioUi: () => void
    darkMode: boolean
    onToggleDarkMode: () => void
}

export const STORAGE_ACCESS_CODE_KEY = "next-ai-draw-io-access-code"
export const STORAGE_CLOSE_PROTECTION_KEY = "next-ai-draw-io-close-protection"
const STORAGE_ACCESS_CODE_REQUIRED_KEY = "next-ai-draw-io-access-code-required"

type TopSettings = {
    textApiKey: string
    textBaseUrl: string
    textModel: string
    imageApiKey: string
    imageBaseUrl: string
    imageModel: string
}

function getStoredAccessCodeRequired(): boolean | null {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(STORAGE_ACCESS_CODE_REQUIRED_KEY)
    if (stored === null) return null
    return stored === "true"
}

function maskApiKey(apiKey: string): string {
    const trimmed = String(apiKey || "").trim()
    if (!trimmed) return ""
    if (trimmed.length <= 8) return "********"
    return `${trimmed.slice(0, 4)}********${trimmed.slice(-4)}`
}

export function SettingsDialog({
    open,
    onOpenChange,
    onCloseProtectionChange,
    drawioUi,
    onToggleDrawioUi,
    darkMode,
    onToggleDarkMode,
}: SettingsDialogProps) {
    const { t } = useLanguage()
    const [accessCode, setAccessCode] = useState("")
    const [closeProtection, setCloseProtection] = useState(true)
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")
    const [accessCodeRequired, setAccessCodeRequired] = useState(
        () => getStoredAccessCodeRequired() ?? false,
    )
    const [topSettings, setTopSettings] = useState<TopSettings>({
        textApiKey: "",
        textBaseUrl: "",
        textModel: "",
        imageApiKey: "",
        imageBaseUrl: "",
        imageModel: "",
    })

    useEffect(() => {
        fetch("/api/config")
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then((data) => {
                const required = data?.accessCodeRequired === true
                if (getStoredAccessCodeRequired() === null) {
                    localStorage.setItem(
                        STORAGE_ACCESS_CODE_REQUIRED_KEY,
                        String(required),
                    )
                }
                setAccessCodeRequired(required)
            })
            .catch(() => {
                setAccessCodeRequired(false)
            })
    }, [])

    useEffect(() => {
        if (open) {
            const storedCode = localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
            setAccessCode(storedCode)

            const storedCloseProtection = localStorage.getItem(
                STORAGE_CLOSE_PROTECTION_KEY,
            )
            setCloseProtection(storedCloseProtection !== "false")

            const workspaceConfig = getWorkspaceAIConfig()
            setTopSettings({
                textApiKey: String(workspaceConfig.textApiKey || workspaceConfig.apiKey || ""),
                textBaseUrl: String(workspaceConfig.textBaseUrl || workspaceConfig.baseUrl || ""),
                textModel: String(workspaceConfig.textModel || workspaceConfig.chatModel || ""),
                imageApiKey: String(workspaceConfig.imageApiKey || workspaceConfig.apiKey || ""),
                imageBaseUrl: String(workspaceConfig.imageBaseUrl || workspaceConfig.baseUrl || ""),
                imageModel: String(workspaceConfig.imageModel || workspaceConfig.imageModelLegacy || ""),
            })

            setError("")
        }
    }, [open])

    const handleSave = async () => {
        if (!accessCodeRequired) {
            onOpenChange(false)
            return
        }

        setError("")
        setIsVerifying(true)

        try {
            const response = await fetch("/api/verify-access-code", {
                method: "POST",
                headers: {
                    "x-access-code": accessCode.trim(),
                },
            })

            const data = await response.json()

            if (!data.valid) {
                setError(data.message || "Invalid access code")
                return
            }

            localStorage.setItem(STORAGE_ACCESS_CODE_KEY, accessCode.trim())
            onOpenChange(false)
        } catch {
            setError("Failed to verify access code")
        } finally {
            setIsVerifying(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            handleSave()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("settings.title")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    {accessCodeRequired && (
                        <div className="space-y-2">
                            <Label htmlFor="access-code">{t("settings.access_code")}</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="access-code"
                                    type="password"
                                    value={accessCode}
                                    onChange={(e) =>
                                        setAccessCode(e.target.value)
                                    }
                                    onKeyDown={handleKeyDown}
                                    placeholder="Enter access code"
                                    autoComplete="off"
                                />
                                <Button
                                    onClick={handleSave}
                                    disabled={isVerifying || !accessCode.trim()}
                                >
                                    {isVerifying ? "..." : "Save"}
                                </Button>
                            </div>
                            <p className="text-[0.8rem] text-muted-foreground">
                                Required to use this application.
                            </p>
                            {error && (
                                <p className="text-[0.8rem] text-destructive">
                                    {error}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="text-sm font-medium text-muted-foreground">
                            {t("settings.ai_config")}
                        </h3>
                        <p className="text-[0.8rem] text-muted-foreground">
                            AI key/base URL/model are read from top-bar Settings.
                        </p>
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="ai-model">{t("settings.model")}</Label>
                                <Input
                                    id="ai-model"
                                    value={topSettings.textModel}
                                    readOnly
                                    disabled
                                    placeholder="-"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ai-image-model">{t("settings.image_model")}</Label>
                                <Input
                                    id="ai-image-model"
                                    value={topSettings.imageModel}
                                    readOnly
                                    disabled
                                    placeholder="-"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ai-base-url">{t("settings.base_url")}</Label>
                                <Input
                                    id="ai-base-url"
                                    value={topSettings.textBaseUrl}
                                    readOnly
                                    disabled
                                    placeholder="-"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ai-api-key">{t("settings.api_key")}</Label>
                                <Input
                                    id="ai-api-key"
                                    type="text"
                                    value={maskApiKey(topSettings.textApiKey)}
                                    readOnly
                                    disabled
                                    placeholder="-"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground">
                            {t("settings.general")}
                        </h3>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="theme-toggle">{t("settings.theme")}</Label>
                                <p className="text-[0.8rem] text-muted-foreground">
                                    {t("settings.theme.desc")}
                                </p>
                            </div>
                            <Button
                                id="theme-toggle"
                                variant="outline"
                                size="icon"
                                onClick={onToggleDarkMode}
                            >
                                {darkMode ? (
                                    <Sun className="h-4 w-4" />
                                ) : (
                                    <Moon className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="drawio-ui">{t("settings.drawio_style")}</Label>
                            <p className="text-[0.8rem] text-muted-foreground">
                                {t("settings.drawio_style.desc")}
                                {drawioUi === "min" ? t("settings.drawio_style.minimal") : t("settings.drawio_style.sketch")}
                            </p>
                        </div>
                        <Button
                            id="drawio-ui"
                            variant="outline"
                            size="sm"
                            onClick={onToggleDrawioUi}
                        >
                            {t("settings.drawio_style.switch")}
                            {drawioUi === "min" ? t("settings.drawio_style.sketch") : t("settings.drawio_style.minimal")}
                        </Button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="close-protection">
                                {t("settings.close_protection")}
                            </Label>
                            <p className="text-[0.8rem] text-muted-foreground">
                                {t("settings.close_protection.desc")}
                            </p>
                        </div>
                        <Switch
                            id="close-protection"
                            checked={closeProtection}
                            onCheckedChange={(checked) => {
                                setCloseProtection(checked)
                                localStorage.setItem(
                                    STORAGE_CLOSE_PROTECTION_KEY,
                                    checked.toString(),
                                )
                                onCloseProtectionChange?.(checked)
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t("settings.close")}
                    </Button>
                    <Button onClick={handleSave}>{t("settings.save")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
