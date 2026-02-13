// Cloudflare Worker (migrated)
// NOTE: original logic was under docs/assets/scripts/worker/worker.js
addEventListener('fetch', event => {
  event.respondWith(new Response(JSON.stringify({ok:true, msg:'worker moved'}), {headers:{'Content-Type':'application/json'}}));
});
