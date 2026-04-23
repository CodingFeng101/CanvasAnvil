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

## Supported providers

- `openai`
- `aliyun`
- `tencent`
- `bytedance`
- `zhipu`
- `google`
- `xai`
- `bfl`
- `adobe`

## Rule

Do not ask the user to paste API keys into chat.

If image generation is requested and `config/image-provider.json` is missing or incomplete, stop and tell the user to fill that file.
