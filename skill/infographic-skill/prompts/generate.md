# Infographic Generation Prompt

Build one final image-generation prompt for a single infographic.

## Requirements

- use the collected infographic fields
- keep the image single-frame
- keep the information hierarchy explicit
- keep the section grouping explicit
- keep the chart intent explicit when charting is requested
- keep the text content and data points explicit
- avoid adding unsupported facts or metrics

## Missing Data Rule

If any required field is missing, ask follow-up questions before producing the final prompt.
