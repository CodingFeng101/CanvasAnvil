import { useEffect, useRef, useState } from "react"
import { DrawIoEmbed } from "react-drawio"
import ChatPanel from "@/workspaces/diagram/chat/ChatPanel"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
    type PanelImperativeHandle,
} from "@/shared/ui/resizable"
import { DiagramProvider, useDiagram } from "@/workspaces/diagram/state/diagram-context"
import { useTheme } from "@/shared/theme"
import { Button } from "@/shared/ui/button"
import { DRAWIO_LOAD_TIMEOUT_MS, drawioSettleDelay, drawioSources, nextDrawioSource } from "@/workspaces/diagram/lib/drawio-source"
import { useDiagramT } from "@/workspaces/diagram/lib/translations"

const DRAWIO_SOURCES = drawioSources(
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_DRAWIO_BASE_URL
        ? String(import.meta.env.VITE_DRAWIO_BASE_URL)
        : "",
)

function DiagramCanvas() {
    const { drawioRef, handleDiagramExport, onDrawioLoad, resetDrawioReady, isDrawioReady } =
        useDiagram()
    const t = useDiagramT()
    const [isMobile, setIsMobile] = useState(false)
    const [isChatVisible, setIsChatVisible] = useState(true)
    // Theme is app-wide now; this canvas only mirrors it into the draw.io embed.
    const { isDark: darkMode, resolved } = useTheme()

    const chatPanelRef = useRef<PanelImperativeHandle>(null)

    // The embed is keyed on the theme, so a change from anywhere -- the app
    // header, or the OS while set to "system" -- remounts it. Reset first so
    // onDrawioLoad fires again afterwards.
    useEffect(() => {
        resetDrawioReady()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolved])

    // Each address gets a few seconds to load before the next is tried; when
    // none loads, the canvas says so instead of staying blank. The address that
    // worked is kept for later remounts (theme changes).
    const [sourceIndex, setSourceIndex] = useState(0)
    const [loadAttempt, setLoadAttempt] = useState(0)
    const [loadFailed, setLoadFailed] = useState(false)
    useEffect(() => {
        if (isDrawioReady || loadFailed) return
        const timer = window.setTimeout(() => {
            const next = nextDrawioSource(DRAWIO_SOURCES, sourceIndex)
            console.warn(`[DiagramCanvas] draw.io did not load from ${DRAWIO_SOURCES[sourceIndex]}`)
            if (next.kind === "next") {
                resetDrawioReady()
                setSourceIndex(next.index)
            } else {
                setLoadFailed(true)
            }
        }, DRAWIO_LOAD_TIMEOUT_MS)
        return () => window.clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDrawioReady, loadFailed, sourceIndex, loadAttempt, resolved])
    useEffect(() => {
        if (isDrawioReady) setLoadFailed(false)
    }, [isDrawioReady])
    // On the GitHub Pages copy of draw.io, a diagram loaded straight after the
    // editor's first load lands at 1% zoom; that copy is reported ready only
    // after it has settled. The public embed is reported ready at once.
    const onEditorLoad = () => {
        const delay = drawioSettleDelay(DRAWIO_SOURCES[sourceIndex])
        if (delay) window.setTimeout(onDrawioLoad, delay)
        else onDrawioLoad()
    }
    const retryDrawio = () => {
        resetDrawioReady()
        setSourceIndex(0)
        setLoadFailed(false)
        setLoadAttempt((n) => n + 1)
    }

    // Check mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    const toggleChatPanel = () => {
        const panel = chatPanelRef.current
        if (panel) {
            if (panel.isCollapsed()) {
                panel.expand()
                setIsChatVisible(true)
            } else {
                panel.collapse()
                setIsChatVisible(false)
            }
        }
    }

    // Keyboard shortcut for toggling chat panel
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "b") {
                event.preventDefault()
                toggleChatPanel()
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [])

    return (
        <div className="h-full bg-background relative overflow-hidden">
            <ResizablePanelGroup
                id="main-panel-group-v3"
                key={isMobile ? "mobile" : "desktop"}
                orientation={isMobile ? "vertical" : "horizontal"}
                className="h-full"
            >
                {/* Draw.io Canvas */}
                <ResizablePanel
                    id="drawio-panel"
                    defaultSize={isMobile ? "50%" : "67%"}
                    minSize="20%"
                >
                    {/* Flush, to match the chat panel: the resize handle is the
                        only divider, so insets and rounding just leak the page
                        ground through at the seams. */}
                    <div className="h-full relative">
                        <div className="h-full overflow-hidden">
                            <DrawIoEmbed
                                key={`drawio-${darkMode}-${sourceIndex}-${loadAttempt}`}
                                ref={drawioRef}
                                onExport={handleDiagramExport}
                                onLoad={onEditorLoad}
                                baseUrl={DRAWIO_SOURCES[sourceIndex]}
                                urlParameters={{
                                    ui: "min",
                                    spin: true,
                                    libraries: false,
                                    saveAndExit: false,
                                    noExitBtn: true,
                                    dark: darkMode,
                                }}
                            />
                        </div>
                        {loadFailed && (
                            <div
                                role="alert"
                                className="absolute inset-0 flex items-center justify-center bg-background/95 p-6"
                            >
                                <div className="max-w-sm text-center space-y-3">
                                    <p className="text-base font-medium">{t("drawio.load_failed")}</p>
                                    <p className="text-sm text-muted-foreground">{t("drawio.load_failed_hint")}</p>
                                    <Button onClick={retryDrawio}>{t("drawio.retry")}</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle id="resize-handle" />

                {/* Chat Panel */}
                <ResizablePanel
                    id="chat-panel"
                    panelRef={chatPanelRef}
                    defaultSize={isMobile ? "50%" : "33%"}
                    minSize={isMobile ? "20%" : "15%"}
                    maxSize={isMobile ? "80%" : "50%"}
                    collapsible={!isMobile}
                    collapsedSize={isMobile ? "0%" : "3%"}
                    onResize={(panelSize) => setIsChatVisible(panelSize.inPixels > 80)}
                >
                    <div className="h-full">
                        <ChatPanel
                            isVisible={isChatVisible}
                            onToggleVisibility={toggleChatPanel}
                            isMobile={isMobile}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}

/**
 * The Diagram workspace: a draw.io canvas beside its chat panel.
 *
 * The diagram context wraps the pair because both halves read and write
 * the same XML — the chat panel proposes edits, the canvas applies them.
 */
export function DiagramWorkspace() {
  return (
    <DiagramProvider>
      <DiagramCanvas />
    </DiagramProvider>
  );
}
