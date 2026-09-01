/**
 * The draw.io shape libraries the Flow agent can pull in on demand.
 *
 * These are runtime data, not documentation: the chat route reads the
 * matching markdown file when the model calls get_shape_library.
 */

export const AVAILABLE_SHAPE_LIBRARIES = [
  "alibaba_cloud",
  "android",
  "arrows2",
  "atlassian",
  "aws4",
  "azure2",
  "basic",
  "bpmn",
  "cabinets",
  "cisco19",
  "citrix",
  "electrical",
  "floorplan",
  "flowchart",
  "fluidpower",
  "gcp2",
  "infographic",
  "kubernetes",
  "lean_mapping",
  "material_design",
  "mscae",
  "network",
  "openstack",
  "pid",
  "rack",
  "salesforce",
  "sap",
  "sitemap",
  "vvd",
  "webicons",
] as const;

export type ShapeLibraryName = (typeof AVAILABLE_SHAPE_LIBRARIES)[number];

export function formatAvailableShapeLibraries(): string {
  return AVAILABLE_SHAPE_LIBRARIES.join(", ");
}
