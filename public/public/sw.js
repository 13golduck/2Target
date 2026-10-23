// Service worker di 2Target: mostra le notifiche push e, al tocco, apre la pagina indicata.
// Niente cache offline: l'app lavora sempre con dati aggiornati.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '2Target', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Solo pagine di 2Target: il percorso arriva dal server, ma si ricontrolla qui
  const path = typeof event.notification.data?.url === 'string' && event.notification.data.url.startsWith('/') && !event.notification.data.url.startsWith('//') ? event.notification.data.url : '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.navigate(target).then((c) => c && c.focus());
      return self.clients.openWindow(target);
    })
  );
});
