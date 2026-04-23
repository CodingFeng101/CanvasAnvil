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

If a reference image is provided but the selected provider or model does not support reference images, ignore the reference image and continue only if the task still makes sense without it. Do not claim that the model used the reference image when it did not.
