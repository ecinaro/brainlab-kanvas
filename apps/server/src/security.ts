import type { FastifyInstance } from 'fastify';

export const CLIENT_HEADER = 'x-canvas-client';
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Başka bir web sitesinin tarayıcı üzerinden bu yerel sunucuya istek atıp
 * kredi harcamasını engeller (CSRF / DNS rebinding):
 *  - Host başlığı yalnızca localhost / 127.0.0.1 olabilir
 *  - Origin varsa o da yerel olmalı
 *  - /api isteklerinde özel başlık zorunlu (basit cross-site istekler bunu gönderemez)
 * CORS eklentisi bilerek yüklenmiyor.
 */
export function registerSecurity(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const host = hostnameOf(req.headers.host ?? '');
    if (!host || !LOCAL_HOSTNAMES.has(host)) {
      return reply.code(403).send({ error: 'forbidden_host' });
    }
    const origin = req.headers.origin;
    if (origin && !LOCAL_HOSTNAMES.has(hostnameOf(origin) ?? '')) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }
    if (req.url.startsWith('/api/') && req.headers[CLIENT_HEADER] !== '1') {
      return reply.code(403).send({ error: 'missing_client_header' });
    }
  });
}
