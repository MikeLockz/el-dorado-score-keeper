import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib';

const DEFAULT_TARGET = 'https://in.hyperdx.io';
const DEFAULT_PORT = 5050;

const upstreamTarget = process.env.HDX_PROXY_TARGET ?? DEFAULT_TARGET;
const upstreamUrl = new URL(upstreamTarget);
const listenPort = Number.parseInt(process.env.HDX_PROXY_PORT ?? '', 10) || DEFAULT_PORT;
const verboseLogging = /^(1|true|yes|on)$/i.test(process.env.HDX_PROXY_VERBOSE ?? '');

const isHttps = upstreamUrl.protocol === 'https:';
const forwardRequest = isHttps ? httpsRequest : httpRequest;

const resolveRequestedHeaders = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value;
};

const corsHeaders = (origin: string | undefined, requestHeaders?: string | string[]) => {
  const resolvedHeaders = resolveRequestedHeaders(requestHeaders);
  const allowHeaders = resolvedHeaders && resolvedHeaders.length > 0
    ? resolvedHeaders
    : 'Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, Content-Encoding';

  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': allowHeaders,
  };
};

const respondWithError = (
  res: ServerResponse,
  statusCode: number,
  message: string,
  details?: string,
  origin?: string,
  requestHeaders?: string | string[],
) => {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    ...corsHeaders(origin, requestHeaders),
  });
  res.end(
    JSON.stringify(
      details
        ? {
            error: message,
            details,
          }
        : { error: message },
    ),
  );
};

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (!req.url || !req.method) {
    respondWithError(
      res,
      400,
      'Invalid request',
      undefined,
      req.headers.origin,
      req.headers['access-control-request-headers'],
    );
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req.headers.origin, req.headers['access-control-request-headers']),
    });
    res.end();
    return;
  }

  const targetUrl = new URL(req.url, upstreamUrl);

  const headers: Record<string, number | string | string[]> = {
    ...req.headers,
    host: upstreamUrl.host,
  };

  const proxyRequest = forwardRequest(
    {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || (isHttps ? 443 : 80),
      method: req.method,
      path: targetUrl.pathname + targetUrl.search,
      headers,
    },
    (proxyResponse) => {
      if (verboseLogging) {
        console.info(
          '[observability] proxy response',
          req.method,
          targetUrl.pathname,
          proxyResponse.statusCode,
        );
      }
      const responseHeaders = {
        ...proxyResponse.headers,
        ...corsHeaders(req.headers.origin, req.headers['access-control-request-headers']),
      };
      res.writeHead(proxyResponse.statusCode ?? 502, responseHeaders);

      if (verboseLogging) {
        const chunks: Buffer[] = [];
        proxyResponse.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        proxyResponse.on('end', () => {
          if (chunks.length > 0) {
            const buffer = Buffer.concat(chunks);
            let decoded = buffer.toString('utf8');
            const responseEncoding = proxyResponse.headers['content-encoding'];
            try {
              if (responseEncoding === 'gzip') {
                decoded = gunzipSync(buffer).toString('utf8');
              } else if (responseEncoding === 'br') {
                decoded = brotliDecompressSync(buffer).toString('utf8');
              } else if (responseEncoding === 'deflate') {
                decoded = inflateSync(buffer).toString('utf8');
              }
            } catch (decodeError) {
              console.info('[observability] proxy response body (decode failed)', (decodeError as Error).message);
              decoded = buffer.toString('base64');
            }

            if (decoded.trim().length > 0) {
              console.info('[observability] proxy response body', decoded);
            }
          }
        });
      }

      proxyResponse.pipe(res);
    },
  );

  if (verboseLogging) {
    console.info('[observability] proxy request', req.method, targetUrl.pathname);
    const apiKeyHeader = headers['x-hdx-api-key'] ?? headers.authorization;
    if (apiKeyHeader) {
      const normalized = Array.isArray(apiKeyHeader)
        ? apiKeyHeader[0]
        : String(apiKeyHeader);
      const masked = normalized.length > 8
        ? `${normalized.slice(0, 4)}…${normalized.slice(-4)}`
        : normalized;
      console.info('[observability] proxy api key detected', masked);
    } else {
      console.info('[observability] proxy api key missing');
    }

    const requestChunks: Buffer[] = [];
    req.on('data', (chunk) => {
      requestChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      if (requestChunks.length === 0) {
        proxyRequest.end();
        return;
      }
      const buffer = Buffer.concat(requestChunks);
      let decoded = buffer.toString('utf8');
      const encoding = req.headers['content-encoding'];
      try {
        if (encoding === 'gzip') {
          decoded = gunzipSync(buffer).toString('utf8');
        } else if (encoding === 'br') {
          decoded = brotliDecompressSync(buffer).toString('utf8');
        } else if (encoding === 'deflate') {
          decoded = inflateSync(buffer).toString('utf8');
        }
      } catch (decodeError) {
        console.info('[observability] proxy request body (decode failed)', (decodeError as Error).message);
        decoded = buffer.toString('base64');
      }

      if (decoded.trim().length > 0) {
        console.info('[observability] proxy request body', decoded);
      }

      proxyRequest.end(buffer);
    });
  } else {
    req.pipe(proxyRequest);
  }

  proxyRequest.on('error', (error) => {
    console.error('[observability] Proxy request failed:', error);
    respondWithError(
      res,
      502,
      'Failed to reach HyperDX',
      (error as Error).message,
      req.headers.origin,
      req.headers['access-control-request-headers'],
    );
  });
});

server.listen(listenPort, () => {
  console.info(
    `[observability] HyperDX proxy listening on http://localhost:${listenPort} -> ${upstreamUrl.origin}`,
  );
  console.info('[observability] Configure NEXT_PUBLIC_HDX_HOST to this proxy to bypass CORS in dev.');
});

server.on('error', (error) => {
  console.error('[observability] Proxy server error:', error);
  process.exitCode = 1;
});
