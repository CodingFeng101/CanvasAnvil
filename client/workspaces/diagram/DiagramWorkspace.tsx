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

const drawioBaseUrl =
    (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_DRAWIO_BASE_URL
        ? String(import.meta.env.VITE_DRAWIO_BASE_URL)
        : "") || "https://embed.diagrams.net"

function DiagramCanvas() {
    const { drawioRef, handleDiagramExport, onDrawioLoad, resetDrawioReady } =
        useDiagram()
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
                                key={`drawio-${darkMode}`}
                                ref={drawioRef}
                                onExport={handleDiagramExport}
                                onLoad={onDrawioLoad}
                                baseUrl={drawioBaseUrl}
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
