export type DiagramOperation = {
  operation: "update" | "add" | "delete";
  cell_id: string;
  new_xml?: string;
};

function parseXml(xml: string): XMLDocument {
  const parser = new DOMParser();
  return parser.parseFromString(xml, "text/xml");
}

function getRoot(doc: XMLDocument): Element {
  const root = doc.querySelector("mxGraphModel > root");
  if (!root) {
    throw new Error("Current diagram XML is missing mxGraphModel/root.");
  }
  return root;
}

function getParserError(doc: XMLDocument): string | null {
  const error = doc.querySelector("parsererror");
  return error ? String(error.textContent || "Invalid XML").trim() : null;
}

function parseSingleMxCell(newXml: string, cellId: string): Element {
  const wrapped = `<root>${String(newXml || "").trim()}</root>`;
  const doc = parseXml(wrapped);
  const parserError = getParserError(doc);
  if (parserError) {
    throw new Error(`Operation XML for cell "${cellId}" is invalid.`);
  }

  const cells = Array.from(doc.querySelectorAll("root > mxCell"));
  if (cells.length !== 1) {
    throw new Error(`Operation XML for cell "${cellId}" must contain exactly one mxCell element.`);
  }

  const cell = cells[0];
  if (cell.getAttribute("id") !== cellId) {
    throw new Error(`Operation cell_id "${cellId}" does not match mxCell id "${cell.getAttribute("id") || ""}".`);
  }
  return cell;
}

function collectDescendantIds(root: Element, cellId: string): Set<string> {
  const ids = new Set<string>([cellId]);
  let changed = true;
  while (changed) {
    changed = false;
    Array.from(root.querySelectorAll("mxCell")).forEach((cell) => {
      const id = cell.getAttribute("id");
      const parent = cell.getAttribute("parent");
      if (!id || !parent) return;
      if (ids.has(parent) && !ids.has(id)) {
        ids.add(id);
        changed = true;
      }
    });
  }
  return ids;
}

export function applyDiagramOperations(xml: string, operations: DiagramOperation[]): string {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("No diagram operations provided.");
  }

  const doc = parseXml(xml);
  const parserError = getParserError(doc);
  if (parserError) {
    throw new Error("Current diagram XML is invalid and cannot be edited.");
  }

  const root = getRoot(doc);
  const serializer = new XMLSerializer();

  for (const operation of operations) {
    const cellId = String(operation?.cell_id || "").trim();
    if (!cellId) {
      throw new Error("Each operation requires a non-empty cell_id.");
    }

    if (operation.operation === "delete") {
      const target = root.querySelector(`mxCell[id="${cellId}"]`);
      if (!target) {
        throw new Error(`Cell "${cellId}" was not found.`);
      }

      const idsToDelete = collectDescendantIds(root, cellId);
      Array.from(root.querySelectorAll("mxCell")).forEach((cell) => {
        const id = cell.getAttribute("id");
        const source = cell.getAttribute("source");
        const targetId = cell.getAttribute("target");
        if (
          (id && idsToDelete.has(id)) ||
          (source && idsToDelete.has(source)) ||
          (targetId && idsToDelete.has(targetId))
        ) {
          cell.parentNode?.removeChild(cell);
        }
      });
      continue;
    }

    if (!String(operation?.new_xml || "").trim()) {
      throw new Error(`Operation "${operation.operation}" for cell "${cellId}" requires new_xml.`);
    }

    const nextCell = parseSingleMxCell(operation.new_xml || "", cellId);
    const imported = doc.importNode(nextCell, true);

    if (operation.operation === "update") {
      const existing = root.querySelector(`mxCell[id="${cellId}"]`);
      if (!existing) {
        throw new Error(`Cell "${cellId}" was not found.`);
      }
      existing.parentNode?.replaceChild(imported, existing);
      continue;
    }

    if (operation.operation === "add") {
      const existing = root.querySelector(`mxCell[id="${cellId}"]`);
      if (existing) {
        throw new Error(`Cell "${cellId}" already exists.`);
      }
      root.appendChild(imported);
      continue;
    }

    throw new Error(`Unsupported operation "${String(operation.operation)}".`);
  }

  return serializer.serializeToString(doc);
}

export function isMxCellXmlComplete(xml: string): boolean {
  const trimmed = String(xml || "").trim();
  if (!trimmed) return false;

  const lastSelfClose = trimmed.lastIndexOf("/>");
  const lastMxCellClose = trimmed.lastIndexOf("</mxCell>");
  const lastValidEnd = Math.max(lastSelfClose, lastMxCellClose);

  if (lastValidEnd === -1) return false;

  const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2;
  const suffix = trimmed.slice(lastValidEnd + endOffset);

  return /^(\s*<\/[^>]+>)*\s*$/.test(suffix);
}
