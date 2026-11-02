// Starý service worker z doby, kdy aplikace byla v kořeni: smaže svou mezipaměť a odregistruje se,
// aby kořenová adresa vedla na přesměrování do app/
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Jen mezipaměti této aplikace – na stejné adrese běží i jiné aplikace
        await Promise.all((await caches.keys()).filter(key => /^(mudrlant|geo-kviz)/.test(key)).map(key => caches.delete(key)));
        await self.registration.unregister();
        for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })());
});
