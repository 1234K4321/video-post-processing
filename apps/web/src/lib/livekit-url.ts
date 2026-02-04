export const toWebsocketUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  return url.replace(/^http/i, "ws");
};

export const toHttpUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return url.replace(/^ws/i, "http");
};
