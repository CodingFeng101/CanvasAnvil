"use client"

import { Cloud, FileText, GitBranch, Palette, Zap } from "lucide-react"
import { useLanguage } from "@/workspaces/flow/next/contexts/language-context"

interface ExampleCardProps {
    icon: React.ReactNode
    title: string
    description: string
    onClick: () => void
    isNew?: boolean
}

function ExampleCard({
    icon,
    title,
    description,
    onClick,
    isNew,
}: ExampleCardProps) {
    const { t } = useLanguage()
    return (
        <button
            onClick={onClick}
            className={`group w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm ${
                isNew
                    ? "border-primary/40 ring-1 ring-primary/20"
                    : "border-border/60"
            }`}
        >
            <div className="flex items-start gap-3">
                <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isNew
                            ? "bg-primary/20 group-hover:bg-primary/25"
                            : "bg-primary/10 group-hover:bg-primary/15"
                    }`}
                >
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {title}
                        </h3>
                        {isNew && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded">
                                {t("example.new")}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {description}
                    </p>
                </div>
            </div>
        </button>
    )
}

interface ExamplePanelProps {
    setInput: (input: string) => void
    setFiles: (files: File[]) => void
}

export default function ExamplePanel({
    setInput,
    setFiles,
}: ExamplePanelProps) {
    const { t } = useLanguage()

    const handleReplicateFlowchart = async () => {
        setInput("Replicate this flowchart.")

        try {
            const response = await fetch("/example.png")
            const blob = await response.blob()
            const file = new File([blob], "example.png", { type: "image/png" })
            setFiles([file])
        } catch (error) {
            console.error("Error loading example image:", error)
        }
    }

    const handleReplicateArchitecture = async () => {
        setInput("Replicate this in aws style")

        try {
            const response = await fetch("/architecture.png")
            const blob = await response.blob()
            const file = new File([blob], "architecture.png", {
                type: "image/png",
            })
            setFiles([file])
        } catch (error) {
            console.error("Error loading architecture image:", error)
        }
    }

    const handlePdfExample = async () => {
        setInput("Summarize this paper as a diagram")

        try {
            const response = await fetch("/chain-of-thought.txt")
            const blob = await response.blob()
            const file = new File([blob], "chain-of-thought.txt", {
                type: "text/plain",
            })
            setFiles([file])
        } catch (error) {
            console.error("Error loading text file:", error)
        }
    }

    return (
        <div className="py-6 px-2 animate-fade-in">
            {/* Welcome section */}
            <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                    {t("welcome.title")}
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    {t("welcome.desc")}
                </p>
            </div>

            {/* Examples grid */}
            <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    {t("examples.title")}
                </p>

                <div className="grid gap-2">
                    <ExampleCard
                        icon={<FileText className="w-4 h-4 text-primary" />}
                        title={t("examples.paper.title")}
                        description={t("examples.paper.desc")}
                        onClick={handlePdfExample}
                        isNew
                    />

                    <ExampleCard
                        icon={<Zap className="w-4 h-4 text-primary" />}
                        title={t("examples.animated.title")}
                        description={t("examples.animated.desc")}
                        onClick={() => {
                            setInput(
                                "Give me a **animated connector** diagram of transformer's architecture",
                            )
                            setFiles([])
                        }}
                    />

                    <ExampleCard
                        icon={<Cloud className="w-4 h-4 text-primary" />}
                        title={t("example.aws.title")}
                        description={t("example.aws.desc")}
                        onClick={handleReplicateArchitecture}
                    />

                    <ExampleCard
                        icon={<GitBranch className="w-4 h-4 text-primary" />}
                        title={t("example.flowchart.title")}
                        description={t("example.flowchart.desc")}
                        onClick={handleReplicateFlowchart}
                    />

                    <ExampleCard
                        icon={<Palette className="w-4 h-4 text-primary" />}
                        title={t("example.creative.title")}
                        description={t("example.creative.desc")}
                        onClick={() => {
                            setInput("Draw a cat for me")
                            setFiles([])
                        }}
                    />
                </div>

                <p className="text-[11px] text-muted-foreground/60 text-center mt-4">
                    {t("example.cached")}
                </p>
            </div>
        </div>
    )
}

