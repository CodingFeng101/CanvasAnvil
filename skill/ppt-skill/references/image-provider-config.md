# Image Provider Config

Image generation uses `config/image-provider.json`.

## Required keys

- `provider`
- `apiKey`
- `model`

## Optional keys

- `baseUrl`

## File Path

- `config/image-provider.json`

## Example

```json
{
  "provider": "openai",
  "apiKey": "YOUR_KEY",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-image-1"
}
```

## Rule

- template generation and slide generation read the same config file by default
- do not ask the user to paste API keys into chat
- if `provider`, `apiKey`, or `model` is missing, stop and tell the user to fill the config file
