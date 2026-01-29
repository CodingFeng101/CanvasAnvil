import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FlowchartWorkspaceProps {
  initialXml?: string;
  onAddToChat?: (xmlSnippet: string) => void;
  onXmlChange?: (xml: string) => void;
}

export function FlowchartWorkspace({ initialXml, onAddToChat, onXmlChange }: FlowchartWorkspaceProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedCells, setSelectedCells] = useState<any[]>([]);
  const lastEmittedXmlRef = useRef<string>("");
  const autosaveInFlightRef = useRef(false);

  // Default empty graph
  const emptyXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          
          // Init event - draw.io is ready
          if (msg.event === 'init') {
             setIsLoaded(true);
             
             // Add "Add to Chat" button to Draw.io menu bar
             const iframe = iframeRef.current;
             if (iframe?.contentWindow) {
                 iframe.contentWindow.postMessage(JSON.stringify({
                     action: 'configure',
                     config: {
                         customButtons: [{
                             action: 'export',
                             format: 'xml',
                             callback: true,
                             label: 'Add to Chat',
                             tooltip: 'Add current diagram to chat',
                             icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMSAxNWExIDEgMCAwIDEtMSAxSDRhMSAxIDAgMCAxLTEtMVY4YTEgMSAwIDAgMSAxLTFoMTZhMSAxIDAgMCAxIDEgMXY3em0tNC03djEwaC0ydjZoLTJ2LTZoLTJ2LTZIOSIgLz48L3N2Zz4='
                         }]
                     }
                 }), '*');
             }
          }
          
          // Listen for auto-save or export events if we were to add them to internal menu
          // but for now we drive it externally.
        } catch (err) {
          // ignore
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const requestExport = () => {
      if (autosaveInFlightRef.current) return;
      autosaveInFlightRef.current = true;

      const handleExport = (e: MessageEvent) => {
        if (typeof e.data !== "string") return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.event !== "export") return;
          const xml = String(msg.data || "");
          autosaveInFlightRef.current = false;
          window.removeEventListener("message", handleExport);
          if (!xml) return;
          if (xml === lastEmittedXmlRef.current) return;
          lastEmittedXmlRef.current = xml;
          onXmlChange?.(xml);
        } catch {
        }
      };

      window.addEventListener("message", handleExport);
      iframe.contentWindow.postMessage(
        JSON.stringify({
          action: "export",
          format: "xml",
          spin: "Saving...",
        }),
        "*"
      );
    };

    requestExport();
    const id = window.setInterval(requestExport, 2500);
    return () => window.clearInterval(id);
  }, [isLoaded, onXmlChange]);

  // Separate effect to handle XML loading when either loaded state or xml changes
  useEffect(() => {
    if (isLoaded && initialXml) {
         const iframe = iframeRef.current;
         if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({
              action: 'load',
              xml: initialXml,
              autosave: false
            }), '*');
         }
    } else if (isLoaded && !initialXml) {
        // Load default if no XML provided but loaded
        const iframe = iframeRef.current;
         if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({
              action: 'load',
              xml: emptyXml,
              autosave: false
            }), '*');
         }
    }
  }, [isLoaded, initialXml]);


  // Remove the second useEffect that was depending on isLoaded and setTimeout
  // to avoid race conditions or double loading.
  
  const handleAddToChat = () => {
     const iframe = iframeRef.current;
     if (!iframe?.contentWindow) return;

     // Request export
     // We need to set up a listener for the export result
     const handleExport = (e: MessageEvent) => {
        if (typeof e.data === 'string') {
            try {
                const msg = JSON.parse(e.data);
                if (msg.event === 'export') {
                    // msg.data contains the XML
                    // If msg.data is empty or just basic wrapper, it might mean nothing selected/drawn
                    // But usually export returns the whole graph
                    if (onAddToChat) {
                        onAddToChat(msg.data);
                    }
                    window.removeEventListener('message', handleExport);
                }
            } catch (e) {
                // ignore non-json
            }
        }
     };
     window.addEventListener('message', handleExport);

     // 'xml' format exports the full graph XML
     iframe.contentWindow.postMessage(JSON.stringify({
        action: 'export',
        format: 'xml',
        spin: 'Updating chat...'
     }), '*');
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full relative overflow-hidden bg-muted flex">
        <iframe
          ref={iframeRef}
          src="https://embed.diagrams.net/?embed=1&ui=min&spin=1&noSaveBtn=1&noExitBtn=1&lang=zh&proto=json"
          className="w-full h-full border-0 block"
          title="流程图编辑器"
        />
      </ContextMenuTrigger>
      
      <ContextMenuContent>
        <ContextMenuItem onClick={handleAddToChat} className="cursor-pointer gap-2">
          <MessageSquarePlus className="w-4 h-4" />
          <span>添加到对话</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
