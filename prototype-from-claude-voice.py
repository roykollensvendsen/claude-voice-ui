# ruff: noqa: E501  (the page's HTML, CSS and script are kept readable, not wrapped)
"""The companion page: a phone page where the owner picks the session the voice talks to,
and watches what that session is doing.

It is served by the bridge at /app, behind the bridge's own login secret. Signing in
sets a cookie scripts cannot read; the database keeps only its hash. Guessing the
secret is cut off after a few tries, and a change sent from another site is refused.
The page itself is plain HTML and a little JavaScript that asks for fresh state every
few seconds, so it needs no build step and no library.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import secrets
import time
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

COOKIE = "cv_app"
SIGN_IN_SECONDS = 30 * 24 * 3600
MAX_FAILURES = 5
FAILURE_WINDOW = 600.0


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class CompanionPage:
    """The routes of the companion page, with the bridge's state handed in as callables."""

    def __init__(
        self,
        store: Any,
        login_secret: str,
        public_url: str,
        state: Callable[[], Awaitable[dict[str, Any]]],
        set_active: Callable[[str, str], dict[str, Any]],
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.store = store
        self.login_secret = login_secret
        self.public_url = public_url.rstrip("/")
        self.state = state
        self.set_active = set_active
        self.clock = clock
        self._failures: list[float] = []

    def routes(self, mcp: Any) -> None:
        mcp.custom_route("/app", methods=["GET"])(self.page)
        mcp.custom_route("/app/login", methods=["POST"])(self.login)
        mcp.custom_route("/app/logout", methods=["POST"])(self.logout)
        mcp.custom_route("/app/api/state", methods=["GET"])(self.api_state)
        mcp.custom_route("/app/api/active", methods=["POST"])(self.api_active)

    def _signed_in(self, request: Request) -> bool:
        token = request.cookies.get(COOKIE)
        return token is not None and self.store.web_session_valid(_hash(token))

    def _same_site(self, request: Request) -> bool:
        """A change must come from this page, not from a page on another site."""
        origin = request.headers.get("origin")
        return origin is not None and origin.rstrip("/") in (
            self.public_url,
            f"{request.url.scheme}://{request.url.netloc}",
        )

    async def page(self, request: Request) -> Response:
        if not self._signed_in(request):
            return HTMLResponse(_login_page())
        return HTMLResponse(PAGE)

    async def login(self, request: Request) -> Response:
        now = self.clock()
        self._failures = [t for t in self._failures if now - t < FAILURE_WINDOW]
        # RULE: guessing the secret on the page stops after five wrong tries
        if len(self._failures) >= MAX_FAILURES:
            return HTMLResponse(_login_page("Too many wrong tries. Wait ten minutes."), 429)
        form = await request.form()
        if not hmac.compare_digest(str(form.get("secret", "")).encode(), self.login_secret.encode()):
            self._failures.append(now)
            return HTMLResponse(_login_page("Wrong secret."), 401)
        token = secrets.token_urlsafe(32)
        self.store.add_web_session(_hash(token), SIGN_IN_SECONDS)
        response = RedirectResponse("/app", status_code=303)
        response.set_cookie(
            COOKIE,
            token,
            max_age=SIGN_IN_SECONDS,
            httponly=True,
            samesite="strict",
            secure=self.public_url.startswith("https://"),
            path="/app",
        )
        return response

    async def logout(self, request: Request) -> Response:
        if not self._same_site(request):
            return JSONResponse({"error": "not from this page"}, 403)
        token = request.cookies.get(COOKIE)
        if token:
            self.store.drop_web_session(_hash(token))
        response = RedirectResponse("/app", status_code=303)
        response.delete_cookie(COOKIE, path="/app")
        return response

    async def api_state(self, request: Request) -> Response:
        if not self._signed_in(request):
            return JSONResponse({"error": "sign in first"}, 401)
        return JSONResponse(await self.state(), headers={"Cache-Control": "no-store"})

    async def api_active(self, request: Request) -> Response:
        if not self._signed_in(request):
            return JSONResponse({"error": "sign in first"}, 401)
        # RULE: a change sent from another site is refused
        if not self._same_site(request):  # a page elsewhere cannot change the choice
            return JSONResponse({"error": "not from this page"}, 403)
        body = await request.json()
        try:
            return JSONResponse(self.set_active(str(body.get("session", "")), "page"))
        except LookupError as exc:
            return JSONResponse({"error": str(exc)}, 404)


def _login_page(error: str = "") -> str:
    note = f'<p class="err">{html.escape(error)}</p>' if error else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Claude voice</title>
<style>{STYLE}</style></head><body><main class="login">
<h1>Claude voice</h1><p>Type the bridge's login secret once; this phone is then remembered for a month.</p>
{note}<form method="post" action="/app/login">
<input type="password" name="secret" autocomplete="current-password" placeholder="Login secret" required autofocus>
<button type="submit">Sign in</button></form></main></body></html>"""


STYLE = """
:root{--bg:#f6f5f2;--card:#fff;--text:#1d1d1b;--muted:#6b6a66;--line:#e2e0db;--accent:#c4562f;--ok:#2f7d4f;--warn:#b07a12}
@media (prefers-color-scheme:dark){:root{--bg:#191917;--card:#242421;--text:#ecebe7;--muted:#a3a29c;--line:#3a3935;--accent:#e2795a;--ok:#5fb383;--warn:#e0b04a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}h1{font-size:1.25rem;margin:.2rem 0 1rem}h2{font-size:1rem;margin:1.4rem 0 .5rem}
.login input,.login button{display:block;width:100%;font:inherit;padding:.8rem;margin:.5rem 0;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.login button{background:var(--accent);color:#fff;border:0}.err{color:var(--accent)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%}
.card.active{border:2px solid var(--accent)}.card b{display:block;overflow-wrap:anywhere}.card small{color:var(--muted);display:block}
.card .doing{margin-top:.35rem;font-size:.9rem}.status{font-size:.8rem;font-weight:600}
.s-busy,.s-shell{color:var(--warn)}.s-idle{color:var(--ok)}.s-waiting{color:var(--accent)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
.turn{border-top:1px solid var(--line);padding:.5rem 0;white-space:pre-wrap;overflow-wrap:anywhere}.turn:first-child{border-top:0}
.who{font-size:.8rem;color:var(--muted)}.ask{border-left:4px solid var(--accent);padding:.4rem .6rem;margin:.4rem 0}
.top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.muted{color:var(--muted)}
.top button{font:inherit;background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer}
a{color:var(--accent)}
"""

PAGE = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Claude voice</title>
<style>{STYLE}</style></head><body><main>
<div class="top"><h1>Claude voice</h1><form method="post" action="/app/logout" id="out"><button>Sign out</button></form></div>
<p class="muted" id="talking">Pick the session the voice talks to.</p>
<div class="cards" id="cards"></div>
<h2 id="dtitle" hidden></h2><div class="panel" id="detail" hidden></div>
<p class="muted" id="when"></p>
</main><script>
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {{ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }};
async function pick(id) {{
  await fetch("/app/api/active", {{method: "POST", headers: {{"Content-Type": "application/json"}}, body: JSON.stringify({{session: id}})}});
  refresh();
}}
function render(s) {{
  const cards = $("cards"); cards.replaceChildren();
  const active = s.active && s.active.id;
  for (const x of s.sessions) {{
    const b = el("button", "card" + (x.id === active ? " active" : ""));
    b.append(el("b", null, x.name || x.id), el("small", null, (x.project || "") + " · " + x.kind));
    b.append(el("span", "status s-" + x.status, x.status));
    if (x.doing) b.append(el("div", "doing", x.doing));
    b.onclick = () => pick(x.id);
    cards.append(b);
  }}
  $("talking").textContent = s.active ? "The voice talks to " + s.active.name + " (chosen by the " + s.active.set_by + ")." : "Pick the session the voice talks to.";
  const d = s.detail, panel = $("detail"), title = $("dtitle");
  panel.hidden = title.hidden = !d;
  if (d) {{
    title.textContent = d.name + " · " + d.status;
    panel.replaceChildren();
    if (d.question) {{ const q = el("div", "ask"); q.append(el("b", null, "Waiting for your choice"), el("div", null, d.question.text)); for (const o of d.question.options || []) q.append(el("div", "muted", "· " + o)); panel.append(q); }}
    else if (d.waiting) panel.append(el("div", "ask", "It is waiting for you at the screen."));
    for (const a of d.approvals || []) panel.append(el("div", "ask", "Approval " + a.number + ": " + a.tool + " " + (a.summary || "")));
    for (const t of d.turns) {{ const r = el("div", "turn"); r.append(el("div", "who", t.role === "user" ? "Asked" : "Claude"), el("div", null, t.text)); panel.append(r); }}
    if (d.prs && d.prs.length) {{
      const h = el("div", "who", "Open pull requests"); panel.append(h);
      for (const p of d.prs) {{ const a = el("a", null, "#" + p.number + " " + p.title + (p.draft ? " (draft)" : "")); a.href = p.url; a.target = "_blank"; a.rel = "noopener"; const r = el("div", "turn"); r.append(a); panel.append(r); }}
    }}
  }}
  $("when").textContent = "Updated " + new Date().toLocaleTimeString();
}}
async function refresh() {{
  try {{
    const r = await fetch("/app/api/state", {{cache: "no-store"}});
    if (r.status === 401) {{ location.reload(); return; }}
    render(await r.json());
  }} catch (e) {{ $("when").textContent = "Can't reach the bridge; trying again."; }}
}}
refresh(); setInterval(refresh, 3000);
document.addEventListener("visibilitychange", () => {{ if (!document.hidden) refresh(); }});
</script></body></html>"""
