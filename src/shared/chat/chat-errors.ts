/**
 * Maps a provider error onto something a user can act on. The raw message is
 * usually an HTTP status or a token-count complaint that says nothing about
 * what to change.
 */
export const getChatErrorText = (
  error: unknown,
  trText: (zhText: string, enText: string) => string
) => {
  const raw = String((error as any)?.message || error || "");

  if (/input token count exceeds|maximum number of tokens allowed|too many tokens|context length/i.test(raw)) {
    return trText(
      "本次请求内容过长，通常是图片或附件内容过大。请重试；如果仍失败，请减少附件数量或缩小单个附件内容。",
      "This request is too large, usually because an image or attachment expanded the input too much. Retry once; if it still fails, reduce the number or size of attachments."
    );
  }

  if (/api key|invalid api key|incorrect api key|unauthorized|401/i.test(raw)) {
    return trText(
      "API 配置无效，请检查 API key 或服务配置。",
      "The API configuration is invalid. Check the API key or provider settings."
    );
  }

  if (/400|bad request/i.test(raw)) {
    return trText(
      "请求格式无效，请检查本次输入或附件内容。",
      "The request payload is invalid. Check this input or its attachments."
    );
  }

  return trText(
    "抱歉，请求失败，请稍后重试。",
    "Sorry, the request failed. Please try again."
  );
};
