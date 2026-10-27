// Starý service worker z doby, kdy aplikace byla v kořeni: smaže svou mezipaměť a odregistruje se,
// aby kořenová adresa vedla na přesměrování do app/
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        await Promise.all((await caches.keys()).map(key => caches.delete(key)));
        await self.registration.unregister();
        for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })());
});
