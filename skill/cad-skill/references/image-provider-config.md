# Image Config

Image generation uses `config/image-provider.json`.

Only OpenAI-compatible endpoints are supported. There is no vendor field:
point `baseUrl` at whichever compatible gateway serves the model.

## Required keys

- `apiKey`
- `model`

## Optional keys

- `baseUrl` -- defaults to `https://api.openai.com/v1`

## File Path

- `config/image-provider.json`

## Example

```json
{
  "apiKey": "YOUR_KEY",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-image-1"
}
```

## Endpoint

Chosen from the model name, not from configuration:

- `gpt-image-*` and `dall-e-*` use the images endpoint
- every other model returns its image through chat completions

## Rule

- do not ask the user to paste API keys into chat
- if `apiKey` or `model` is missing, stop and tell the user to fill the config file
