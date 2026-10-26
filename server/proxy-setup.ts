import { ProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Routes Node's built-in `fetch` through the machine's HTTP(S) proxy, when one
 * is configured.
 *
 * Node's `fetch` (undici under the hood) ignores `HTTP_PROXY`/`HTTPS_PROXY`
 * unlike most CLI tools, so on a network where those upstream hosts are only
 * reachable through a proxy, every outbound call this server makes -- image
 * generation included -- needs this wired in before anything else runs.
 */

const proxyUrl =
  process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}
