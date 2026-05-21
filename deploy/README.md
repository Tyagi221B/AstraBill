# Deploy — AstraBill PDF service droplet

Everything that runs outside Vercel lives on a single DigitalOcean
droplet, orchestrated by `docker-compose.yml` in this directory. Today
that's Caddy + the PDF service. The compose file is set up so the
worker + Redis can join the same droplet without re-architecting.

This document is the bring-up runbook AND the redeploy runbook.

## What it looks like running

```
  Vercel (Next.js)                          Customers
      │                                         │
      │ POST https://pdf.astrabill.com/render   │ GET https://...
      ▼                                         ▼
  ┌─────────────────────── Droplet ─────────────────────────┐
  │  :80, :443  →  Caddy  ────►  pdf-service:4000           │
  │                  (TLS + reverse-proxy)  (Puppeteer)     │
  └─────────────────────────────────────────────────────────┘
```

The droplet's only public surface is :80 + :443. Everything else stays
on the docker network. Caddy handles TLS automatically via Let's
Encrypt — no certbot cron, no manual renewals.

## First-time bring-up

### 1. Create the droplet (DigitalOcean console)

- Droplet plan: **Basic, Regular SSD, $12/mo** (2GB RAM / 1 vCPU / 50GB).
  Don't go lower — Puppeteer wants ~500MB idle and will OOM on the
  $6 plan under any concurrent load.
- Image: **Ubuntu 24.04 (LTS) x64**
- Region: **Bangalore (BLR1)** — nearest to the target customer base.
- Authentication: **SSH key**, not password.
- Hostname: `astrabill-prod` (or whatever — only matters in DO's UI).
- Enable **DigitalOcean monitoring** (free, gives you CPU/RAM/disk
  graphs in the panel).

After creation, note the public IPv4 address.

### 2. Add the DNS record (Cloudflare)

In Cloudflare DNS for `astrabill.com`:

- Type: **A**
- Name: **pdf**
- IPv4 address: `<droplet public IP>`
- Proxy status: **DNS only (grey cloud)** — critical. If you turn on
  Cloudflare proxy (orange cloud) Caddy can't complete the
  Let's Encrypt HTTP-01 challenge and TLS issuance breaks.
- TTL: **Auto**

Verify before continuing:

```bash
dig +short pdf.astrabill.com
# should print the droplet IP
```

### 3. SSH in + harden the basics

```bash
ssh root@<droplet IP>

# Patch + reboot. ~3 minutes.
apt update && apt upgrade -y
apt install -y ufw fail2ban

# Firewall: only SSH + HTTP + HTTPS. Docker bypasses ufw for
# published ports (the :80/:443 in docker-compose go through
# iptables directly), but ufw still locks down the host's own
# services — defense in depth.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

reboot
```

Wait ~30s, reconnect.

### 4. Install Docker + Compose

Per Docker's official install (the apt one — package versions stay
fresher and security updates flow through apt):

```bash
ssh root@<droplet IP>

# Docker's apt repo
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Sanity
docker --version
docker compose version
```

### 5. Clone the repo

```bash
mkdir -p /opt
git clone https://github.com/<your-gh-user>/AstraBill.git /opt/astrabill
cd /opt/astrabill
git log --oneline -1   # confirm you're on the commit you expect
```

### 6. Configure the env

```bash
cd /opt/astrabill/deploy
cp .env.example .env

# Generate the shared secret and put it in .env. Save this — you'll
# paste the SAME value into Vercel later.
openssl rand -hex 32
# Edit .env, paste the value as PDF_SERVICE_TOKEN=<value>
```

### 7. Bring up the stack

```bash
cd /opt/astrabill/deploy
docker compose up -d --build
# First build pulls the Puppeteer base image (~700MB) + builds the
# pdf-service. ~5 minutes the first time, <30s on subsequent rebuilds.

docker compose ps
# Both containers should be `Up` / `running`.

docker compose logs -f --tail=50 caddy
# Watch for `certificate obtained successfully` for pdf.astrabill.com.
# Ctrl-C out when you see it. Takes ~10-30s after the containers start.
```

### 8. Verify before touching Vercel

From your laptop (NOT the droplet):

```bash
curl -i https://pdf.astrabill.com/health
# Expected: HTTP/2 200 + body { "ok": true }
# If you get a TLS error, the cert isn't issued yet — wait 30s, retry.
# If you get 502, pdf-service isn't responding — check `docker compose
# logs pdf-service` on the droplet.
```

### 9. Wire up Vercel

In the Vercel dashboard for the `astrabill` project → Settings → Environment Variables, add (scope: Production AND Preview):

```
PDF_SERVICE_URL=https://pdf.astrabill.com
PDF_SERVICE_TOKEN=<the same hex string you put in /opt/astrabill/deploy/.env>
```

Then either trigger a redeploy from the Vercel dashboard, or push any
trivial commit to `main`. Vercel rebuilds with the new env vars.

### 10. End-to-end smoke test

Pull up a finalised invoice in the app, then hit:

```
https://www.astrabill.com/api/invoices/<invoiceId>/pdf
```

You should get a PDF download (or inline PDF view), not the
`SERVICE_UNAVAILABLE` JSON. Open it — verify the brand colour, line
items, totals all look right.

If the business has its UPI ID set (`/settings/payments`), the
payment-details footer at the bottom shows the QR code next to the
UPI ID text.

---

## Redeploying after a code change

Any change to `pdf-service/` source or the contract requires a
droplet redeploy. The Next.js app deploys via Vercel on push, but
the droplet doesn't watch the repo.

```bash
ssh root@<droplet IP>
cd /opt/astrabill
git pull
cd deploy
docker compose up -d --build pdf-service
```

`--build` reruns the Docker build (TypeScript compile, dependency
install if package.json changed). `up -d` recreates only what's
changed — Caddy stays untouched.

Confirm it's up:

```bash
docker compose ps
docker compose logs --tail=30 pdf-service
```

## Adding services later (worker, Redis)

When BullMQ + the cron worker land, they become additional `services:`
entries in `docker-compose.yml`. Pattern:

```yaml
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes: [redis_data:/data]
    networks: [astrabill]

  worker:
    build:
      context: ../worker
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://redis:6379
    networks: [astrabill]
    depends_on: [redis]
```

Neither needs `ports:` — both are internal-only, reachable only from
inside the docker network. The pdf-service won't be touched.

## Troubleshooting

**Caddy stuck retrying TLS issuance.**
Check:
- `dig +short pdf.astrabill.com` resolves to the droplet IP
- Cloudflare proxy is **grey cloud** (DNS only), not orange
- Droplet ufw allows :80 (the HTTP-01 challenge hits :80, not :443)

**pdf-service container exits immediately.**
`docker compose logs pdf-service` — most often a Puppeteer launch error
because the base image's Chromium can't find a shared lib. The
`ghcr.io/puppeteer/puppeteer` base image is supposed to ship a working
Chromium; if it doesn't, check that `PORT=4000` is set and that
`dist/index.js` exists in the built image.

**Vercel still returns SERVICE_UNAVAILABLE after wiring env vars.**
You need to redeploy after adding env vars — Vercel doesn't hot-reload
them. Push a commit OR click "Redeploy" on the latest deployment.

**Out of memory mid-render.**
The $12 droplet has 2GB. If you hit OOM at higher invoice complexity:
add swap (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap
/swapfile && swapon /swapfile`), then upgrade the droplet plan when
you have time. Swap is a band-aid — a 4GB droplet is the real fix.
