import { useEffect, useRef, useState } from "react"
import { DrawIoEmbed } from "react-drawio"
import ChatPanel from "@/workspaces/flow/chat/ChatPanel"
import { STORAGE_CLOSE_PROTECTION_KEY } from "@/workspaces/flow/chat/settings-dialog"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
    type PanelImperativeHandle,
} from "@/shared/ui/resizable"
import { DiagramProvider, useDiagram } from "@/workspaces/flow/state/diagram-context"
import { useTheme } from "@/shared/theme"

const drawioBaseUrl =
    (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_DRAWIO_BASE_URL
        ? String(import.meta.env.VITE_DRAWIO_BASE_URL)
        : "") || "https://embed.diagrams.net"

function FlowCanvas() {
    const { drawioRef, handleDiagramExport, onDrawioLoad, resetDrawioReady } =
        useDiagram()
    const [isMobile, setIsMobile] = useState(false)
    const [isChatVisible, setIsChatVisible] = useState(true)
    const [drawioUi, setDrawioUi] = useState<"min" | "sketch">("min")
    // Theme is app-wide now; this canvas only mirrors it into the draw.io embed.
    const { isDark: darkMode, resolved, setTheme } = useTheme()
    const [isLoaded, setIsLoaded] = useState(false)
    const [closeProtection, setCloseProtection] = useState(false)

    const chatPanelRef = useRef<PanelImperativeHandle>(null)

    // Load preferences from localStorage after mount
    useEffect(() => {
        const savedUi = localStorage.getItem("drawio-theme")
        if (savedUi === "min" || savedUi === "sketch") {
            setDrawioUi(savedUi)
        }

        const savedCloseProtection = localStorage.getItem(
            STORAGE_CLOSE_PROTECTION_KEY,
        )
        if (savedCloseProtection === "true") {
            setCloseProtection(true)
        }

        setIsLoaded(true)
    }, [])

    const toggleDarkMode = () => {
        setTheme(darkMode ? "light" : "dark")
    }

    // The embed is keyed on the theme, so a change from anywhere -- this
    // canvas's own button, the app header, or the OS while set to "system" --
    // remounts it. Reset first so onDrawioLoad fires again afterwards.
    useEffect(() => {
        resetDrawioReady()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolved])

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

    // Show confirmation dialog when user tries to leave the page
    useEffect(() => {
        if (!closeProtection) return

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            return ""
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [closeProtection])

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
                    <div
                        className={`h-full relative ${
                            isMobile ? "p-1" : "p-2"
                        }`}
                    >
                        <div className="h-full rounded-xl overflow-hidden shadow-soft-lg border border-border/30">
                            {isLoaded ? (
                                <DrawIoEmbed
                                    key={`${drawioUi}-${darkMode}`}
                                    ref={drawioRef}
                                    onExport={handleDiagramExport}
                                    onLoad={onDrawioLoad}
                                    baseUrl={drawioBaseUrl}
                                    urlParameters={{
                                        ui: drawioUi,
                                        spin: true,
                                        libraries: false,
                                        saveAndExit: false,
                                        noExitBtn: true,
                                        dark: darkMode,
                                    }}
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-background">
                                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                                </div>
                            )}
                        </div>
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
                    <div className={`h-full ${isMobile ? "p-1" : "py-2 pr-2"}`}>
                        <ChatPanel
                            isVisible={isChatVisible}
                            onToggleVisibility={toggleChatPanel}
                            drawioUi={drawioUi}
                            onToggleDrawioUi={() => {
                                const newUi =
                                    drawioUi === "min" ? "sketch" : "min"
                                localStorage.setItem("drawio-theme", newUi)
                                setDrawioUi(newUi)
                                resetDrawioReady()
                            }}
                            darkMode={darkMode}
                            onToggleDarkMode={toggleDarkMode}
                            isMobile={isMobile}
                            onCloseProtectionChange={setCloseProtection}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}

/**
 * The Flow workspace: a draw.io canvas beside its chat panel.
 *
 * The diagram context wraps the pair because both halves read and write
 * the same XML — the chat panel proposes edits, the canvas applies them.
 */
export function FlowWorkspace() {
  return (
    <DiagramProvider>
      <FlowCanvas />
    </DiagramProvider>
  );
}
