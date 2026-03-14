// Service Worker — The Preparation
// Handles Monday 7am plan-ready notification

const CACHE_NAME = "tp-v1";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(clients.claim());
});

// Listen for messages from the app
self.addEventListener("message", e => {
  if (e.data?.type === "SCHEDULE_MONDAY_CHECK") {
    scheduleMondayCheck();
  }
});

function scheduleMondayCheck() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon
  const msUntilNextMonday7am = (() => {
    const next = new Date(now);
    // Days until next Monday
    const daysUntilMon = day === 1
      ? (now.getHours() < 7 ? 0 : 7) // if Monday before 7am: today; else next week
      : (8 - day) % 7 || 7;
    next.setDate(now.getDate() + daysUntilMon);
    next.setHours(7, 0, 0, 0);
    return next.getTime() - now.getTime();
  })();

  // Use setTimeout in SW context (won't survive SW restart, but app open covers this)
  setTimeout(() => {
    self.registration.showNotification("The Preparation", {
      body: "Your week plan is ready — 20h scheduled.",
      icon: "/icon.png",
      tag: "weekly-plan",
      requireInteraction: false,
    });
  }, msUntilNextMonday7am);
}

// Handle notification click — open app
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    })
  );
});
