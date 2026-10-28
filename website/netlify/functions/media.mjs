import { getStore } from '@netlify/blobs';
export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[\w-]+$/.test(id)) return new Response('Not found', { status: 404 });
  const store = getStore('grayco-media');
  const res = await store.getWithMetadata(id, { type: 'arrayBuffer' });
  if (!res) return new Response('Not found', { status: 404 });
  return new Response(res.data, { headers: { 'content-type': res.metadata?.type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' } });
};
