self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Rest complete",
    body: "Ready for your next set.",
    tag: "rest-timer",
    url: "/workouts",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = {
          title:
            typeof parsed.title === "string" && parsed.title.length > 0
              ? parsed.title
              : payload.title,
          body:
            typeof parsed.body === "string" && parsed.body.length > 0
              ? parsed.body
              : payload.body,
          tag:
            typeof parsed.tag === "string" && parsed.tag.length > 0
              ? parsed.tag
              : payload.tag,
          url:
            typeof parsed.url === "string" && parsed.url.startsWith("/")
              ? parsed.url
              : payload.url,
        };
      }
    } catch {
      const text = event.data.text();
      if (text) {
        payload.body = text;
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      renotify: true,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url;
  const targetPath =
    typeof rawUrl === "string" && rawUrl.startsWith("/") ? rawUrl : "/workouts";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        const targetUrl = new URL(targetPath, self.location.origin).href;
        for (const client of clientList) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        for (const client of clientList) {
          if (
            client.url.startsWith(self.location.origin) &&
            "focus" in client
          ) {
            await client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return client;
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
