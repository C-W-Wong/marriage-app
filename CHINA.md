# Serving this site to guests in mainland China

The app is hosted on Cloudflare's standard network, which is slow / partially
blocked in mainland China without an ICP licence and Cloudflare's Enterprise
China Network. Code-level optimisations (route splitting, font self-hosting,
image-proxy with long cache, etc.) get a CN guest to "works, slow" — but for
"works, fast" you also need an edge presence that's reachable from CN.

Below are three deployment options, cheapest first. Pick one; you don't need all
three.

---

## Option A — HK / Singapore VPS + Cloudflare front

**Cost:** ~$5–10/mo VPS, $0 Cloudflare.

1. Spin up a small VPS in Hong Kong, Tokyo, or Singapore (Vultr / DigitalOcean
   / Linode all have these regions).
2. Run this app on it (the `Dockerfile` and `docker-compose.yml` in the repo
   are enough — `docker compose up -d`).
3. Point a subdomain like `cn.chris-eileen.com` at the VPS via Cloudflare DNS,
   **with proxy disabled (grey cloud)**. Cloudflare's free proxy is what's
   slow in CN; direct DNS to a HK box is fast.
4. Optional: in `index.html` or via a tiny edge function, geo-redirect
   `navigator.language === 'zh-CN'` visitors to the CN subdomain.

Pros: cheap, no ICP needed, one-day setup.
Cons: you operate a VPS. Latency is good (Tokyo ~50ms from Shanghai) but not
*great* (~150–250ms for the rest of CN).

---

## Option B — Tencent EdgeOne (CN-resident CDN, free tier)

**Cost:** free for low-volume sites, no ICP needed for the EdgeOne *Global*
plan (CN edges run from HK/Singapore, not mainland POPs).

1. Sign up: <https://edgeone.ai/products/edgeone>
2. Add `chris-eileen.com` as a site, set the origin to the current Cloudflare
   address (or directly to the underlying server).
3. EdgeOne Global ≈ Cloudflare-equivalent but with CN-routable POPs.
4. Use it for the CN-facing subdomain only; keep Cloudflare for everyone else.

Pros: closest thing to "Cloudflare for CN" without the Enterprise sticker.
Cons: requires WeChat / Tencent account; English UX is rough but workable.

---

## Option C — Aliyun OSS + DCDN (static site only)

**Cost:** ~$2–5/mo at this traffic level. **Requires an ICP licence**, which
takes 2–4 weeks and a mainland-Chinese business entity. Skip unless someone
on your side already has one.

1. `npm run build` and upload `dist/` to Aliyun OSS.
2. Front it with Aliyun DCDN (full-site acceleration).
3. The image-proxy server (`server/index.ts`) still needs to live somewhere —
   put it on an ECS box in Hangzhou or Beijing.

Pros: fastest CN experience (sub-50ms TTFB nationwide).
Cons: ICP is the gating factor, plus you're now running two stacks (CN + global).

---

## Geo-redirect snippet (optional)

If you set up a CN-facing subdomain via Option A or B, drop this near the top
of `<head>` so CN guests bounce automatically. It runs before the React bundle
loads, so a redirect costs ~0ms.

```html
<script>
  (function () {
    if (location.hostname === 'cn.chris-eileen.com') return;
    var lang = (navigator.language || '').toLowerCase();
    var likelyCN = lang.indexOf('zh-cn') === 0 || lang === 'zh' || lang.indexOf('zh-hans') === 0;
    if (likelyCN) {
      location.replace('https://cn.chris-eileen.com' + location.pathname + location.search);
    }
  })();
</script>
```

The `isLikelyChinaUser()` helper in `src/weddingConfig.ts` uses the same
heuristic for in-app fallbacks (calendar/maps buttons).

---

## What's already in the code (so you can stop reading early)

Even without a CN edge, these are now done in the bundle itself:

- **Google Fonts self-hosted** under `/fonts/` — no more `fonts.googleapis.com`
  blocking render.
- **Route-split** main bundle: `/photos/...` only loads the Gallery code.
- **Manual vendor chunks** (`react`, `motion`, `lucide`) so per-route bundles
  cache independently.
- **Long-cache `Cache-Control: immutable`** on hashed `/assets/` and `/fonts/`.
- **Same-origin image proxy** (`/img/p/...` and `/img/u/...`) with on-disk
  cache, replacing Supabase signed URLs that came with `no-cache`.
- **Paginated gallery** — initial JSON dropped from ~1 MB to ~30 KB.
- **`keyboard-typing.wav` → `.mp3`** (1.6 MB → 67 KB), no eager preload.
- **CN-safe calendar + maps** — Baidu Maps + Outlook for users detected as zh-CN.
- **CSP tightened** — Google / Cloudflare-Workers connect/frame entries removed
  now that nothing depends on them.
