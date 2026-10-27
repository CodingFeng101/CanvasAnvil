# Shape Library Index

Use this file to select the correct shape-library reference before generating specialized diagrams.

## Common choices

- `aws4.md`: AWS cloud architecture
- `azure2.md`: Azure cloud architecture
- `gcp2.md`: Google Cloud architecture
- `kubernetes.md`: Kubernetes diagrams
- `bpmn.md`: BPMN workflows
- `network.md`: network devices and topology
- `cisco19.md`: Cisco-specific network diagrams
- `floorplan.md`: floor plans and room layouts
- `material_design.md`: Material Design UI icons
- `flowchart.md`: standard flowchart shapes
- `infographic.md`: infographic-oriented iconography

## Source of truth

The canonical library references for this skill live in:

`references/shape-libraries/`

Read the needed source file directly, for example:

- `references/shape-libraries/aws4.md`
- `references/shape-libraries/azure2.md`
- `references/shape-libraries/kubernetes.md`

## Rule

If a requested domain obviously maps to a documented library, read that file before generating XML. Do not invent library prefixes or shape names.
