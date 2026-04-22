import { type ClassValue, clsx } from "clsx"
import * as pako from "pako"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const MAX_XML_SIZE = 1_000_000
const STRUCTURAL_ATTRS = [
    "edge",
    "parent",
    "source",
    "target",
    "vertex",
    "connectable",
] as const
const VALID_ENTITIES = new Set(["lt", "gt", "amp", "quot", "apos"])

interface ParsedTag {
    tagName: string
    isClosing: boolean
    isSelfClosing: boolean
}

function parseXmlTags(xml: string): ParsedTag[] {
    const tags: ParsedTag[] = []
    let i = 0

    while (i < xml.length) {
        const tagStart = xml.indexOf("<", i)
        if (tagStart === -1) break

        let tagEnd = tagStart + 1
        let inQuote = false
        let quoteChar = ""
        while (tagEnd < xml.length) {
            const ch = xml[tagEnd]
            if (inQuote) {
                if (ch === quoteChar) inQuote = false
            } else if (ch === '"' || ch === "'") {
                inQuote = true
                quoteChar = ch
            } else if (ch === ">") {
                break
            }
            tagEnd++
        }

        if (tagEnd >= xml.length) break
        const tag = xml.slice(tagStart, tagEnd + 1)
        const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(tag)
        if (match) {
            tags.push({
                tagName: match[2],
                isClosing: match[1] === "/",
                isSelfClosing: tag.endsWith("/>"),
            })
        }
        i = tagEnd + 1
    }

    return tags
}

function checkDuplicateStructuralAttributes(xml: string): string | null {
    const tagPattern = /<[^>]+>/g
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagPattern.exec(xml)) !== null) {
        const tag = tagMatch[0]
        const attrPattern = /\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=/g
        const counts = new Map<string, number>()
        let attrMatch: RegExpExecArray | null
        while ((attrMatch = attrPattern.exec(tag)) !== null) {
            const name = attrMatch[1]
            counts.set(name, (counts.get(name) || 0) + 1)
        }
        const duplicates = Array.from(counts.entries())
            .filter(([name, count]) => count > 1 && STRUCTURAL_ATTRS.includes(name as (typeof STRUCTURAL_ATTRS)[number]))
            .map(([name]) => name)
        if (duplicates.length > 0) {
            return `Invalid XML: Duplicate structural attribute(s): ${duplicates.join(", ")}.`
        }
    }
    return null
}

function checkTagMismatches(xml: string): string | null {
    const tags = parseXmlTags(xml.replace(/<!--[\s\S]*?-->/g, ""))
    const stack: string[] = []
    for (const tag of tags) {
        if (tag.isClosing) {
            const expected = stack.pop()
            if (!expected) {
                return `Invalid XML: Closing tag </${tag.tagName}> without matching opening tag.`
            }
            if (expected.toLowerCase() !== tag.tagName.toLowerCase()) {
                return `Invalid XML: Expected closing tag </${expected}> but found </${tag.tagName}>.`
            }
        } else if (!tag.isSelfClosing) {
            stack.push(tag.tagName)
        }
    }
    if (stack.length > 0) {
        return `Invalid XML: Document has unclosed tag(s): ${stack.join(", ")}.`
    }
    return null
}

function checkEntityReferences(xml: string): string | null {
    if (/&(?!(?:lt|gt|amp|quot|apos|#))/g.test(xml)) {
        return "Invalid XML: Found unescaped & character(s). Replace & with &amp;."
    }
    const invalidEntityPattern = /&([a-zA-Z][a-zA-Z0-9]*);/g
    let match: RegExpExecArray | null
    while ((match = invalidEntityPattern.exec(xml)) !== null) {
        if (!VALID_ENTITIES.has(match[1])) {
            return `Invalid XML: Invalid entity reference: &${match[1]};`
        }
    }
    return null
}

/**
 * Format XML string with proper indentation and line breaks
 * @param xml - The XML string to format
 * @param indent - The indentation string (default: '  ')
 * @returns Formatted XML string
 */
export function formatXML(xml: string, indent: string = "  "): string {
    let formatted = ""
    let pad = 0

    // Remove existing whitespace between tags
    xml = xml.replace(/>\s*</g, "><").trim()

    // Split on tags
    const tags = xml.split(/(?=<)|(?<=>)/g).filter(Boolean)

    tags.forEach((node) => {
        if (node.match(/^<\/\w/)) {
            // Closing tag - decrease indent
            pad = Math.max(0, pad - 1)
            formatted += indent.repeat(pad) + node + "\n"
        } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
            // Opening tag
            formatted += indent.repeat(pad) + node
            // Only add newline if next item is a tag
            const nextIndex = tags.indexOf(node) + 1
            if (nextIndex < tags.length && tags[nextIndex].startsWith("<")) {
                formatted += "\n"
                if (!node.match(/^<\w[^>]*\/>$/)) {
                    pad++
                }
            }
        } else if (node.match(/^<\w[^>]*\/>$/)) {
            // Self-closing tag
            formatted += indent.repeat(pad) + node + "\n"
        } else if (node.startsWith("<")) {
            // Other tags (like <?xml)
            formatted += indent.repeat(pad) + node + "\n"
        } else {
            // Text content
            formatted += node
        }
    })

    return formatted.trim()
}

/**
 * Efficiently converts a potentially incomplete XML string to a legal XML string by closing any open tags properly.
 * Additionally, if an <mxCell> tag does not have an mxGeometry child (e.g. <mxCell id="3">),
 * it removes that tag from the output.
 * Also removes orphaned <mxPoint> elements that aren't inside <Array> or don't have proper 'as' attribute.
 * @param xmlString The potentially incomplete XML string
 * @returns A legal XML string with properly closed tags and removed incomplete mxCell elements.
 */
export function convertToLegalXml(xmlString: string): string {
    // This regex will match either self-closing <mxCell .../> or a block element
    // <mxCell ...> ... </mxCell>. Unfinished ones are left out because they don't match.
    const regex = /<mxCell\b[^>]*(?:\/>|>([\s\S]*?)<\/mxCell>)/g
    let match: RegExpExecArray | null
    let result = "<root>\n"

    while ((match = regex.exec(xmlString)) !== null) {
        // match[0] contains the entire matched mxCell block
        let cellContent = match[0]

        // Remove orphaned <mxPoint> elements that are directly inside <mxGeometry>
        // without an 'as' attribute (like as="sourcePoint", as="targetPoint")
        // and not inside <Array as="points">
        // These cause "Could not add object mxPoint" errors in draw.io
        // First check if there's an <Array as="points"> - if so, keep all mxPoints inside it
        const hasArrayPoints = /<Array\s+as="points">/.test(cellContent)
        if (!hasArrayPoints) {
            // Remove mxPoint elements without 'as' attribute
            cellContent = cellContent.replace(
                /<mxPoint\b[^>]*\/>/g,
                (pointMatch) => {
                    // Keep if it has an 'as' attribute
                    if (/\sas=/.test(pointMatch)) {
                        return pointMatch
                    }
                    // Remove orphaned mxPoint
                    return ""
                },
            )
        }

        // Indent each line of the matched block for readability.
        const formatted = cellContent
            .split("\n")
            .map((line) => "    " + line.trim())
            .filter((line) => line.trim()) // Remove empty lines from removed mxPoints
            .join("\n")
        result += formatted + "\n"
    }
    result += "</root>"

    return result
}

/**
 * Wrap XML content with the full mxfile structure required by draw.io.
 * Handles cases where XML is just <root>, <mxGraphModel>, or already has <mxfile>.
 * @param xml - The XML string (may be partial or complete)
 * @returns Full mxfile-wrapped XML string
 */
export function wrapWithMxFile(xml: string): string {
    const rootCells = '<mxCell id="0"/><mxCell id="1" parent="0"/>'
    if (!xml) {
        return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>${rootCells}</root></mxGraphModel></diagram></mxfile>`
    }

    // Already has full structure
    if (xml.includes("<mxfile")) {
        return xml
    }

    // Has mxGraphModel but not mxfile
    if (xml.includes("<mxGraphModel")) {
        return `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`
    }

    let content = xml.replace(/<\/?root>/g, "").trim()

    const lastSelfClose = content.lastIndexOf("/>")
    const lastMxCellClose = content.lastIndexOf("</mxCell>")
    const lastValidEnd = Math.max(lastSelfClose, lastMxCellClose)
    if (lastValidEnd !== -1) {
        const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2
        const suffix = content.slice(lastValidEnd + endOffset)
        if (/^(\s*<\/[^>]+>)*\s*$/.test(suffix)) {
            content = content.slice(0, lastValidEnd + endOffset)
        }
    }

    content = content
        .replace(/<mxCell[^>]*\bid=["']0["'][^>]*(?:\/>|><\/mxCell>)/g, "")
        .replace(/<mxCell[^>]*\bid=["']1["'][^>]*(?:\/>|><\/mxCell>)/g, "")
        .trim()

    return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>${rootCells}${content}</root></mxGraphModel></diagram></mxfile>`
}

/**
 * Replace nodes in a Draw.io XML diagram
 * @param currentXML - The original Draw.io XML string
 * @param nodes - The XML string containing new nodes to replace in the diagram
 * @returns The updated XML string with replaced nodes
 */
export function replaceNodes(currentXML: string, nodes: string): string {
    // Check for valid inputs
    if (!currentXML || !nodes) {
        throw new Error("Both currentXML and nodes must be provided")
    }

    try {
        // Parse the XML strings to create DOM objects
        const parser = new DOMParser()
        const currentDoc = parser.parseFromString(currentXML, "text/xml")

        // Handle nodes input - if it doesn't contain <root>, wrap it
        let nodesString = nodes
        if (!nodes.includes("<root>")) {
            nodesString = `<root>${nodes}</root>`
        }

        const nodesDoc = parser.parseFromString(nodesString, "text/xml")

        // Find the root element in the current document
        let currentRoot = currentDoc.querySelector("mxGraphModel > root")
        if (!currentRoot) {
            // If no root element is found, create the proper structure
            const mxGraphModel =
                currentDoc.querySelector("mxGraphModel") ||
                currentDoc.createElement("mxGraphModel")

            if (!currentDoc.contains(mxGraphModel)) {
                currentDoc.appendChild(mxGraphModel)
            }

            currentRoot = currentDoc.createElement("root")
            mxGraphModel.appendChild(currentRoot)
        }

        // Find the root element in the nodes document
        const nodesRoot = nodesDoc.querySelector("root")
        if (!nodesRoot) {
            throw new Error(
                "Invalid nodes: Could not find or create <root> element",
            )
        }

        // Clear all existing child elements from the current root
        while (currentRoot.firstChild) {
            currentRoot.removeChild(currentRoot.firstChild)
        }

        // Ensure the base cells exist
        const hasCell0 = Array.from(nodesRoot.childNodes).some(
            (node) =>
                node.nodeName === "mxCell" &&
                (node as Element).getAttribute("id") === "0",
        )

        const hasCell1 = Array.from(nodesRoot.childNodes).some(
            (node) =>
                node.nodeName === "mxCell" &&
                (node as Element).getAttribute("id") === "1",
        )

        // Copy all child nodes from the nodes root to the current root
        Array.from(nodesRoot.childNodes).forEach((node) => {
            const importedNode = currentDoc.importNode(node, true)
            currentRoot.appendChild(importedNode)
        })

        // Add default cells if they don't exist
        if (!hasCell0) {
            const cell0 = currentDoc.createElement("mxCell")
            cell0.setAttribute("id", "0")
            currentRoot.insertBefore(cell0, currentRoot.firstChild)
        }

        if (!hasCell1) {
            const cell1 = currentDoc.createElement("mxCell")
            cell1.setAttribute("id", "1")
            cell1.setAttribute("parent", "0")

            // Insert after cell0 if possible
            const cell0 = currentRoot.querySelector('mxCell[id="0"]')
            if (cell0?.nextSibling) {
                currentRoot.insertBefore(cell1, cell0.nextSibling)
            } else {
                currentRoot.appendChild(cell1)
            }
        }

        // Convert the modified DOM back to a string
        const serializer = new XMLSerializer()
        return serializer.serializeToString(currentDoc)
    } catch (error) {
        throw new Error(`Error replacing nodes: ${error}`)
    }
}

/**
 * Create a character count dictionary from a string
 * Used for attribute-order agnostic comparison
 */
function charCountDict(str: string): Map<string, number> {
    const dict = new Map<string, number>()
    for (const char of str) {
        dict.set(char, (dict.get(char) || 0) + 1)
    }
    return dict
}

/**
 * Compare two strings by character frequency (order-agnostic)
 */
function sameCharFrequency(a: string, b: string): boolean {
    const trimmedA = a.trim()
    const trimmedB = b.trim()
    if (trimmedA.length !== trimmedB.length) return false

    const dictA = charCountDict(trimmedA)
    const dictB = charCountDict(trimmedB)

    if (dictA.size !== dictB.size) return false

    for (const [char, count] of dictA) {
        if (dictB.get(char) !== count) return false
    }
    return true
}

/**
 * Replace specific parts of XML content using search and replace pairs
 * @param xmlContent - The original XML string
 * @param searchReplacePairs - Array of {search: string, replace: string} objects
 * @returns The updated XML string with replacements applied
 */
export function replaceXMLParts(
    xmlContent: string,
    searchReplacePairs: Array<{ search: string; replace: string }>,
): string {
    let result = formatXML(xmlContent)

    const normalize = (text: string) =>
        String(text || "")
            .replace(/\s+/g, " ")
            .trim()

    for (const pair of searchReplacePairs) {
        const rawSearch = String(pair?.search || "").trim()
        const rawReplace = String(pair?.replace || "")
        if (!rawSearch) {
            throw new Error("Search pattern cannot be empty")
        }

        const formattedSearch = formatXML(rawSearch)
        const formattedReplace = formatXML(rawReplace)

        // 1) Fast exact replacement on normalized XML.
        if (result.includes(formattedSearch)) {
            result = result.replace(formattedSearch, formattedReplace)
            continue
        }

        // 2) Line-window replacement by whitespace-normalized comparison.
        const resultLines = result.split("\n")
        const searchLines = formattedSearch.split("\n").filter((line) => line !== "")
        const replaceLines = formattedReplace.split("\n").filter((line) => line !== "")
        const normalizedSearch = normalize(searchLines.join(" "))

        let found = false
        for (let i = 0; i <= resultLines.length - searchLines.length; i++) {
            const candidate = normalize(
                resultLines.slice(i, i + searchLines.length).join(" "),
            )
            if (candidate !== normalizedSearch) continue

            const nextLines = [
                ...resultLines.slice(0, i),
                ...replaceLines,
                ...resultLines.slice(i + searchLines.length),
            ]
            result = nextLines.join("\n")
            found = true
            break
        }

        if (found) continue

        // 3) Fallback: attribute-order agnostic line comparison.
        let fallbackStart = -1
        for (let i = 0; i <= resultLines.length - searchLines.length; i++) {
            let ok = true
            for (let j = 0; j < searchLines.length; j++) {
                if (!sameCharFrequency(resultLines[i + j], searchLines[j])) {
                    ok = false
                    break
                }
            }
            if (ok) {
                fallbackStart = i
                break
            }
        }

        if (fallbackStart >= 0) {
            const nextLines = [
                ...resultLines.slice(0, fallbackStart),
                ...replaceLines,
                ...resultLines.slice(fallbackStart + searchLines.length),
            ]
            result = nextLines.join("\n")
            continue
        }

        throw new Error(
            "Search pattern not found in the diagram. The pattern may not exist in the current structure.",
        )
    }

    return formatXML(result)
}

/**
 * Validates draw.io XML structure for common issues
 * @param xml - The XML string to validate
 * @returns null if valid, error message string if invalid
 */
export function validateMxCellStructure(xml: string): string | null {
    if (xml.length > MAX_XML_SIZE) {
        console.warn(
            `[validateMxCellStructure] XML size (${xml.length}) exceeds ${MAX_XML_SIZE} bytes.`,
        )
    }

    const dupAttrError = checkDuplicateStructuralAttributes(xml)
    if (dupAttrError) {
        return dupAttrError
    }

    const tagMismatchError = checkTagMismatches(xml)
    if (tagMismatchError) {
        return tagMismatchError
    }

    const entityError = checkEntityReferences(xml)
    if (entityError) {
        return entityError
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, "text/xml")

    // Check for XML parsing errors (includes unescaped special characters)
    const parseError = doc.querySelector("parsererror")
    if (parseError) {
        return `Invalid XML: The XML contains syntax errors (likely unescaped special characters like <, >, & in attribute values). Please escape special characters: use &lt; for <, &gt; for >, &amp; for &, &quot; for ". Regenerate the diagram with properly escaped values.`
    }

    // Get all mxCell elements once for all validations
    const allCells = doc.querySelectorAll("mxCell")

    // Single pass: collect IDs, check for duplicates, nesting, orphans, and invalid parents
    const cellIds = new Set<string>()
    const duplicateIds: string[] = []
    const nestedCells: string[] = []
    const orphanCells: string[] = []
    const invalidParents: { id: string; parent: string }[] = []
    const edgesToValidate: {
        id: string
        source: string | null
        target: string | null
    }[] = []

    allCells.forEach((cell) => {
        const id = cell.getAttribute("id")
        const parent = cell.getAttribute("parent")
        const isEdge = cell.getAttribute("edge") === "1"

        // Check for duplicate IDs
        if (id) {
            if (cellIds.has(id)) {
                duplicateIds.push(id)
            } else {
                cellIds.add(id)
            }
        }

        // Check for nested mxCell (parent element is also mxCell)
        if (cell.parentElement?.tagName === "mxCell") {
            nestedCells.push(id || "unknown")
        }

        // Check parent attribute (skip root cell id="0")
        if (id !== "0") {
            if (!parent) {
                if (id) orphanCells.push(id)
            } else {
                // Store for later validation (after all IDs collected)
                invalidParents.push({ id: id || "unknown", parent })
            }
        }

        // Collect edges for connection validation
        if (isEdge) {
            edgesToValidate.push({
                id: id || "unknown",
                source: cell.getAttribute("source"),
                target: cell.getAttribute("target"),
            })
        }
    })

    // Return errors in priority order
    if (nestedCells.length > 0) {
        return `Invalid XML: Found nested mxCell elements (IDs: ${nestedCells.slice(0, 3).join(", ")}). All mxCell elements must be direct children of <root>, never nested inside other mxCell elements. Please regenerate the diagram with correct structure.`
    }

    if (duplicateIds.length > 0) {
        return `Invalid XML: Found duplicate cell IDs (${duplicateIds.slice(0, 3).join(", ")}). Each mxCell must have a unique ID. Please regenerate the diagram with unique IDs for all elements.`
    }

    if (orphanCells.length > 0) {
        return `Invalid XML: Found cells without parent attribute (IDs: ${orphanCells.slice(0, 3).join(", ")}). All mxCell elements (except id="0") must have a parent attribute. Please regenerate the diagram with proper parent references.`
    }

    // Validate parent references (now that all IDs are collected)
    const badParents = invalidParents.filter((p) => !cellIds.has(p.parent))
    if (badParents.length > 0) {
        const details = badParents
            .slice(0, 3)
            .map((p) => `${p.id} (parent: ${p.parent})`)
            .join(", ")
        return `Invalid XML: Found cells with invalid parent references (${details}). Parent IDs must reference existing cells. Please regenerate the diagram with valid parent references.`
    }

    // Validate edge connections
    const invalidConnections: string[] = []
    edgesToValidate.forEach((edge) => {
        if (edge.source && !cellIds.has(edge.source)) {
            invalidConnections.push(`${edge.id} (source: ${edge.source})`)
        }
        if (edge.target && !cellIds.has(edge.target)) {
            invalidConnections.push(`${edge.id} (target: ${edge.target})`)
        }
    })

    if (invalidConnections.length > 0) {
        return `Invalid XML: Found edges with invalid source/target references (${invalidConnections.slice(0, 3).join(", ")}). Edge source and target must reference existing cell IDs. Please regenerate the diagram with valid edge connections.`
    }

    // Check for orphaned mxPoint elements (not inside <Array as="points"> and without 'as' attribute)
    // These cause "Could not add object mxPoint" errors in draw.io
    const allMxPoints = doc.querySelectorAll("mxPoint")
    const orphanedMxPoints: string[] = []
    allMxPoints.forEach((point) => {
        const hasAsAttr = point.hasAttribute("as")
        const parentIsArray =
            point.parentElement?.tagName === "Array" &&
            point.parentElement?.getAttribute("as") === "points"

        if (!hasAsAttr && !parentIsArray) {
            // Find the parent mxCell to report which edge has the problem
            let parent = point.parentElement
            while (parent && parent.tagName !== "mxCell") {
                parent = parent.parentElement
            }
            const cellId = parent?.getAttribute("id") || "unknown"
            if (!orphanedMxPoints.includes(cellId)) {
                orphanedMxPoints.push(cellId)
            }
        }
    })

    if (orphanedMxPoints.length > 0) {
        return `Invalid XML: Found orphaned mxPoint elements in cells (${orphanedMxPoints.slice(0, 3).join(", ")}). mxPoint elements must either have an 'as' attribute (e.g., as="sourcePoint") or be inside <Array as="points">. For edge waypoints, use: <Array as="points"><mxPoint x="..." y="..."/></Array>. Please fix the mxPoint structure.`
    }

    return null
}

export function autoFixXml(xml: string): { fixed: string; fixes: string[] } {
    let fixed = String(xml || "")
    const fixes: string[] = []

    if (/=\\"/.test(fixed)) {
        fixed = fixed.replace(/\\"/g, '"').replace(/\\n/g, "\n")
        fixes.push("Fixed JSON-escaped XML")
    }

    if (/^\s*<!\[CDATA\[/.test(fixed)) {
        fixed = fixed.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")
        fixes.push("Removed CDATA wrapper")
    }

    if (/&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g.test(fixed)) {
        fixed = fixed.replace(
            /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g,
            "&amp;",
        )
        fixes.push("Escaped unescaped & characters")
    }

    fixed = fixed.replace(/<Cell(\s|>)/g, "<mxCell$1")
    fixed = fixed.replace(/<\/Cell>/g, "</mxCell>")
    fixed = fixed.replace(/<\/mxcell>/g, "</mxCell>")
    fixed = fixed.replace(/<\/mxgeometry>/g, "</mxGeometry>")
    fixed = fixed.replace(/<\/mxpoint>/g, "</mxPoint>")

    fixed = fixed.replace(
        /<mxPoint\b([^>]*)\/>/g,
        (match, attrs) => (/(\s|^)as=/.test(attrs) ? match : ""),
    )

    fixed = fixed.replace(
        /<mxCell([^>]*)\sid\s*=\s*["']\s*["']([^>]*)>/g,
        (_match, before, after) =>
            `<mxCell${before} id="cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}"${after}>`,
    )

    fixed = fixed.replace(/\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)=\=/g, ' $1=')
    fixed = fixed.replace(/\bparent==/g, 'parent=')
    fixed = fixed.replace(/\bstyle==/g, 'style=')
    fixed = fixed.replace(/\bhtml==/g, 'html=')
    fixed = fixed.replace(/\brounded==/g, 'rounded=')

    fixed = fixed.replace(/=\s*"([^"]*)"/g, (_match, value) => {
        const escaped = String(value)
            .replace(/&(?!lt;|gt;|amp;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
        return `="${escaped}"`
    })

    if (!fixed.includes("<mxGraphModel") && !fixed.includes("<mxfile")) {
        fixed = fixed
            .replace(/<mxCell[^>]*\bid=["']0["'][^>]*(?:\/>|><\/mxCell>)/g, "")
            .replace(/<mxCell[^>]*\bid=["']1["'][^>]*(?:\/>|><\/mxCell>)/g, "")
            .trim()
    }

    if (fixed !== xml && fixes.length === 0) {
        fixes.push("Applied XML normalization")
    }

    return { fixed, fixes }
}

export function validateAndFixXml(xml: string): {
    valid: boolean
    error: string | null
    fixed: string | null
    fixes: string[]
} {
    const initialError = validateMxCellStructure(xml)
    if (!initialError) {
        return { valid: true, error: null, fixed: null, fixes: [] }
    }

    const { fixed, fixes } = autoFixXml(xml)
    const finalError = validateMxCellStructure(fixed)
    if (!finalError) {
        return { valid: true, error: null, fixed, fixes }
    }

    return {
        valid: false,
        error: finalError,
        fixed: fixes.length > 0 ? fixed : null,
        fixes,
    }
}

export function extractDiagramXML(xml_svg_string: string): string {
    try {
        // 1. Parse the SVG string (using built-in DOMParser in a browser-like environment)
        const svgString = atob(xml_svg_string.slice(26))
        const parser = new DOMParser()
        const svgDoc = parser.parseFromString(svgString, "image/svg+xml")
        const svgElement = svgDoc.querySelector("svg")

        if (!svgElement) {
            throw new Error("No SVG element found in the input string.")
        }
        // 2. Extract the 'content' attribute
        const encodedContent = svgElement.getAttribute("content")

        if (!encodedContent) {
            throw new Error("SVG element does not have a 'content' attribute.")
        }

        // 3. Decode HTML entities (using a minimal function)
        function decodeHtmlEntities(str: string) {
            const textarea = document.createElement("textarea") // Use built-in element
            textarea.innerHTML = str
            return textarea.value
        }
        const xmlContent = decodeHtmlEntities(encodedContent)

        // 4. Parse the XML content
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml")
        const diagramElement = xmlDoc.querySelector("diagram")

        if (!diagramElement) {
            throw new Error("No diagram element found")
        }
        // 5. Extract base64 encoded data
        const base64EncodedData = diagramElement.textContent

        if (!base64EncodedData) {
            throw new Error("No encoded data found in the diagram element")
        }

        // 6. Decode base64 data
        const binaryString = atob(base64EncodedData)

        // 7. Convert binary string to Uint8Array
        const len = binaryString.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }

        // 8. Decompress data using pako (equivalent to zlib.decompress with wbits=-15)
        const decompressedData = pako.inflate(bytes, { windowBits: -15 })

        // 9. Convert the decompressed data to a string
        const decoder = new TextDecoder("utf-8")
        const decodedString = decoder.decode(decompressedData)

        // Decode URL-encoded content (equivalent to Python's urllib.parse.unquote)
        const urlDecodedString = decodeURIComponent(decodedString)

        return urlDecodedString
    } catch (error) {
        console.error("Error extracting diagram XML:", error)
        throw error // Re-throw for caller handling
    }
}

