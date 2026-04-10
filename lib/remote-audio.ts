import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

type RemoteOpenResult = {
  response: http.IncomingMessage;
  finalUrl: string;
};

type ResolvedRemoteAsset = {
  finalUrl: string;
  mimeType?: string;
  statusCode?: number;
};

function isRedirect(statusCode?: number) {
  return Boolean(statusCode && statusCode >= 300 && statusCode < 400);
}

function buildRequestOptions(targetUrl: string, method: "GET" | "HEAD") {
  const parsedUrl = new URL(targetUrl);

  return {
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || undefined,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method,
    headers: {
      "User-Agent": "Hanlingo/1.0",
      Accept: "*/*",
    },
    rejectUnauthorized: false,
  };
}

async function openRemoteUrl(
  targetUrl: string,
  method: "GET" | "HEAD",
  redirects = 0,
): Promise<RemoteOpenResult> {
  if (redirects > 6) {
    throw new Error(`Too many redirects while resolving ${targetUrl}.`);
  }

  const requestOptions = buildRequestOptions(targetUrl, method);
  const client = requestOptions.protocol === "https:" ? https : http;

  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const request = client.request(requestOptions, resolve);
    request.on("error", reject);
    request.end();
  });

  if (isRedirect(response.statusCode) && response.headers.location) {
    response.resume();
    const nextUrl = new URL(response.headers.location, targetUrl).toString();
    return openRemoteUrl(nextUrl, method, redirects + 1);
  }

  return {
    response,
    finalUrl: targetUrl,
  };
}

export async function resolveRemoteAsset(
  targetUrl: string,
): Promise<ResolvedRemoteAsset | null> {
  try {
    const headResult = await openRemoteUrl(targetUrl, "HEAD");
    const mimeType = headResult.response.headers["content-type"];
    const statusCode = headResult.response.statusCode;
    headResult.response.resume();

    return {
      finalUrl: headResult.finalUrl,
      mimeType: Array.isArray(mimeType) ? mimeType[0] : mimeType,
      statusCode,
    };
  } catch {
    try {
      const getResult = await openRemoteUrl(targetUrl, "GET");
      const mimeType = getResult.response.headers["content-type"];
      const statusCode = getResult.response.statusCode;
      getResult.response.resume();

      return {
        finalUrl: getResult.finalUrl,
        mimeType: Array.isArray(mimeType) ? mimeType[0] : mimeType,
        statusCode,
      };
    } catch {
      return null;
    }
  }
}

export async function downloadRemoteBuffer(targetUrl: string) {
  const result = await openRemoteUrl(targetUrl, "GET");
  const chunks: Buffer[] = [];

  for await (const chunk of result.response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const mimeType = result.response.headers["content-type"];

  return {
    buffer: Buffer.concat(chunks),
    finalUrl: result.finalUrl,
    mimeType: Array.isArray(mimeType) ? mimeType[0] : mimeType,
  };
}

export async function openRemoteAudioStream(targetUrl: string) {
  return openRemoteUrl(targetUrl, "GET");
}
