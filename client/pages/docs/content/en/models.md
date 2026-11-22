# Connecting a model

CanvasAnvil ships no model and picks no vendor for you. It speaks one language, the OpenAI HTTP protocol, and nearly every model provider understands it.

## Two channels

Settings → Models holds two independent sets of fields:

| Channel | Used for | Fields |
| --- | --- | --- |
| Text | Conversation, diagram XML, floor plan layout, deck outlines and pages | Base URL, API key, model |
| Image | Free drawing generation and edits, picture slides | Base URL, API key, model |

For diagrams and floor plans alone, the text channel is enough.

> [!WHY]
> Words and pictures often come from different vendors: one text model writes best, another image model draws best. With two separate channels you never have to settle for one to get the other.

## Filling them in

- **Base URL**: any OpenAI-compatible endpoint, such as `https://api.openai.com/v1`. Switching vendors means changing this one line.
- **API key**: kept only in this device's browser, and sent with each request to the address you entered, nowhere else.
- **Model**: add as many as you like and switch between them below the input at any time.

Then press Test connection: it sends one small real request to make sure everything connects.

## Two roads to an image

An image request first tries `/images/generations` (or `/images/edits` when there is a reference image). If your provider does not offer that route, it falls back to generating the image through the chat route. So whichever way your provider serves images, it usually just works.

## Usage

The tokens of every request and the number of images generated are recorded in Settings → Usage, broken down by canvas, by model and over time. These figures stay on your computer.
