/**
 * Rabnix web chat widget loader.
 *
 * Embed on any site with:
 *   <script src="https://YOUR-APP/widget.js" data-chat-key="wc_..." async></script>
 *
 * It renders a floating launcher button and, on click, toggles an <iframe>
 * pointing at <app-origin>/embed/<key>. The app origin is derived from this
 * script's own src, so there's no URL to configure. All chat network calls
 * happen inside the iframe (same-origin to the app) — this file makes no API
 * calls except a one-off config fetch to style the launcher.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var key = script.getAttribute("data-chat-key");
  if (!key) {
    console.error("[rabnix-widget] missing data-chat-key on <script>.");
    return;
  }

  // Guard against the snippet being included twice.
  if (window.__rabnixChatLoaded) return;
  window.__rabnixChatLoaded = true;

  var origin = new URL(script.src).origin;

  // Fetch public config to style the launcher (and to know it's enabled).
  fetch(origin + "/api/chat/" + encodeURIComponent(key) + "/config")
    .then(function (r) {
      if (!r.ok) throw new Error("widget disabled");
      return r.json();
    })
    .then(function (config) {
      render(config);
    })
    .catch(function () {
      /* disabled or unreachable — render nothing */
    });

  function render(config) {
    var themeColor = config.themeColor || "#4f46e5";
    var label = config.launcherLabel || "Chat with us";

    // ── Launcher button ──────────────────────────────────────────────
    var launcher = document.createElement("button");
    launcher.setAttribute("aria-label", label);
    launcher.style.cssText = [
      "position:fixed",
      "bottom:20px",
      "right:20px",
      "z-index:2147483000",
      "width:56px",
      "height:56px",
      "border-radius:9999px",
      "border:none",
      "cursor:pointer",
      "box-shadow:0 6px 20px rgba(0,0,0,0.25)",
      "background:" + themeColor,
      "color:#fff",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "transition:transform .15s ease",
    ].join(";");
    launcher.innerHTML = chatIcon();

    // ── Chat iframe (created lazily on first open) ───────────────────
    var frame = null;
    var open = false;

    function ensureFrame() {
      if (frame) return frame;
      frame = document.createElement("iframe");
      frame.src = origin + "/embed/" + encodeURIComponent(key);
      frame.title = "Chat";
      frame.style.cssText = [
        "position:fixed",
        "bottom:88px",
        "right:20px",
        "z-index:2147483000",
        "width:380px",
        "height:600px",
        "max-width:calc(100vw - 40px)",
        "max-height:calc(100vh - 120px)",
        "border:none",
        "border-radius:16px",
        "box-shadow:0 12px 40px rgba(0,0,0,0.3)",
        "background:#fff",
        "display:none",
      ].join(";");
      document.body.appendChild(frame);
      return frame;
    }

    function toggle() {
      open = !open;
      var f = ensureFrame();
      f.style.display = open ? "block" : "none";
      launcher.innerHTML = open ? closeIcon() : chatIcon();
      launcher.style.transform = open ? "scale(0.95)" : "none";
    }

    launcher.addEventListener("click", toggle);
    document.body.appendChild(launcher);
  }

  function chatIcon() {
    return (
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 ' +
      "8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 " +
      '8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 ' +
      '8.48 0 0 1 8 8v.5z"/></svg>'
    );
  }

  function closeIcon() {
    return (
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/>' +
      '<line x1="6" y1="6" x2="18" y2="18"/></svg>'
    );
  }
})();
