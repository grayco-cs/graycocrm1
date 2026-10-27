import { getStore } from '@netlify/blobs';
export default async () => {
  const store = getStore('grayco-site');
  const s = await store.get('content');
  return new Response(s || '{}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
};
