---
type: decision
updated: 2026-05-22
sources: 0
---

# Droplet — deploy, harden, recover

The operational runbook for the AstraBill DigitalOcean droplet that runs
the PDF service (and, in time, the cron worker + Redis). Rationale for the
*architecture* lives in [[decision/infrastructure]] and
[[decision/pdf-generation]]; this page is the *what to do when* —
deploying, hardening, and recovering when SSH locks us out.

## Droplet identity

| Field | Value |
|---|---|
| Name | `astrabill-prod` |
| Region | BLR1 (Bangalore) |
| Size | Basic AMD · 1 vCPU · 2 GB RAM · 25 GB SSD |
| OS | Ubuntu 24.04 LTS |
| Public IPv4 | see `PDF_SERVICE_URL` env on Vercel (also `139.59.89.235` at time of writing — IP can change on a future destroy/rebuild) |
| Public IPv6 | enabled |
| DNS | `pdf.astrabill.com` → public IPv4 (Cloudflare, DNS-only grey-cloud — Caddy needs the HTTP-01 challenge to reach it; orange-cloud would terminate TLS at Cloudflare's edge and break ACME) |
| Public ports | `:80` + `:443` (Caddy) — nothing else exposed |

The droplet has **zero data state worth saving**: no DB (Supabase), no
uploads (Cloudinary). The whole machine is effectively a stateless render
node — destroy + recreate is a valid recovery path (15-20 min).

## Repo + deploy layout (on the droplet)

```
/opt/astrabill/                       ← full git clone of the repo
├── .git/
├── pdf-service/                      ← Express + Puppeteer source
│   ├── Dockerfile                    ← FROM ghcr.io/puppeteer/puppeteer:24.10.0
│   ├── package.json
│   └── src/
└── deploy/                           ← Docker Compose project
    ├── docker-compose.yml            ← caddy + pdf-service services
    ├── Caddyfile                     ← reverse-proxy config, ACME-managed TLS
    ├── .env                          ← PDF_SERVICE_TOKEN lives here (do not commit)
    └── .env.example
```

The compose file builds `pdf-service` from `../pdf-service` (relative to
`deploy/`) — no container registry, the image is pinned to whatever
commit is checked out on the droplet.

## Deploy flow (the happy path)

From your laptop, ship the code:
```
git push origin main
```

SSH to the droplet:
```bash
ssh astrabill-prod                    # see ~/.ssh/config alias below
cd /opt/astrabill && git pull
cd deploy && docker compose up -d --build pdf-service
docker compose logs -f --tail=100 pdf-service   # Ctrl-C after `listening on :4000`
```

Verify from outside the droplet:
```bash
curl -s https://pdf.astrabill.com/health
# → {"ok":true,"service":"astrabill-pdf-service"}
```

Real smoke test: open the AstraBill app, hit Download PDF on an existing
finalised sales invoice. That exercises the whole Vercel → Caddy →
pdf-service → Cloudinary path.

**Caddy is never rebuilt by `--build pdf-service`** — its TLS certs
persist in the `caddy_data` named volume. Only restart Caddy if its
config changes (edit the Caddyfile then `docker compose up -d caddy`).

## SSH access

Hardening applied (post-recovery 2026-05-22):
- `PermitRootLogin prohibit-password` — root login allowed but **only**
  via SSH key (no password auth even with one set)
- `PasswordAuthentication no` — keys only across the board
- `UsePAM yes` — needed for session setup
- `fail2ban` installed and active — bans repeated failed SSH attempts;
  default `bantime` is 10 min

The owner's `~/.ssh/id_ed25519` (commit `ashmittyagigms@gmail.com`) is in
`/root/.ssh/authorized_keys`. DigitalOcean's Droplet Agent also injects
short-lived `ecdsa-sha2-nistp256` keys with `expire_at` for the
hypervisor-side console; do not remove them.

### Laptop alias (`~/.ssh/config`)

```
Host astrabill-prod
  HostName 139.59.89.235
  User root
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

`IdentitiesOnly yes` is **load-bearing** — it stops SSH from offering
every key on disk in turn. Without it, the first 2-3 failed offerings
trip fail2ban and ban the laptop's IP for 10 minutes (this happened
2026-05-22; took 30 minutes to recover via rescue ISO).

### Recovery if you ever get locked out (the runbook we wrote in blood)

When SSH stops working AND the DO Web Console says "All configured
authentication methods failed", both paths are dead because both go
through the droplet's running `sshd`. The escape hatch is the
**DO Recovery ISO** — a separate Linux env that boots from a DO-managed
image instead of the droplet's disk.

Step-by-step:

1. **Power off** the droplet (DO dashboard → droplet → top-right toggle Off)
2. **DO dashboard → droplet → Settings → Recovery mode → Edit →
   "Boot from Recovery ISO" → Save**
3. **Power on** the droplet → wait ~30s for the rescue Ubuntu to boot
4. **DO dashboard → Settings → Recovery console → Launch Console** — you
   get the recovery menu directly (no password needed; the rescue env
   sets its own random root password printed in the banner, and auto-
   imports any keys that were on the droplet's metadata)
5. In the menu: **`1`** (mount disk image — droplet root mounts at `/mnt`)
   → **`6`** (interactive bash shell)
6. From the shell:
   ```bash
   # Inspect sshd config — find what's blocking auth
   grep -iE '^(PermitRoot|Password|Pubkey|AllowUsers|ChallengeResponse|UsePAM)' \
     /mnt/etc/ssh/sshd_config /mnt/etc/ssh/sshd_config.d/*.conf 2>/dev/null

   # The 2026-05-22 culprit was PermitRootLogin no. Fix:
   sed -i 's/^PermitRootLogin no/PermitRootLogin prohibit-password/' \
     /mnt/etc/ssh/sshd_config

   # Confirm your key is still in authorized_keys
   cat /mnt/root/.ssh/authorized_keys

   # Clear any fail2ban bans (sqlite DB; deletion = next boot starts clean)
   rm -f /mnt/var/lib/fail2ban/fail2ban.sqlite3
   ```
7. `exit` → close the console tab
8. **DO dashboard → Settings → Recovery mode → Edit → "Boot from Hard Drive"
   → Save** (forgetting this leaves you in rescue mode after every boot)
9. Power-cycle the droplet → wait ~30s → `ssh astrabill-prod` should work

If after SSH-ing in you hit **"You are required to change your password
immediately (administrator enforced)"** and the session drops — that's a
PAM password-expiry trap (`chage -d 0 root` or equivalent was at some
point set). Recovery:

1. **DO dashboard → Access → "Reset root password"** — DO emails a fresh
   temp password
2. `ssh astrabill-prod` again; at the `Current password:` prompt paste
   the emailed temp one, then set a new one
3. Once in, kill the expiry policy so it never bites again:
   ```bash
   chage -d "$(date +%Y-%m-%d)" root
   chage -M 99999 root
   chage -l root   # "Password expires : never"
   ```

## GitHub access for `git pull` (deploy key)

`git pull` over HTTPS + Personal Access Token is fragile — PATs expire
(GitHub defaults: 30/60/90 days), the credential helper isn't always
configured, and the failure mode is mid-deploy. We hit this 2026-05-22
and had to mint a fresh PAT in the middle of recovery.

**The right setup is an SSH deploy key** — a read-only SSH key locked to
ONE repo (no org-wide access), with no expiry:

1. On the droplet: `ssh-keygen -t ed25519 -C "astrabill-prod-deploy" -f /root/.ssh/github_deploy -N ""`
2. `cat /root/.ssh/github_deploy.pub` — copy the printed key
3. GitHub repo → Settings → **Deploy keys** → Add deploy key → paste,
   name "astrabill-prod", **leave "Allow write access" UNCHECKED** (read
   is all the droplet needs)
4. On the droplet, add a Host entry to `/root/.ssh/config`:
   ```
   Host github.com
     User git
     IdentityFile /root/.ssh/github_deploy
     IdentitiesOnly yes
   ```
5. Switch the repo's remote from HTTPS to SSH:
   ```bash
   cd /opt/astrabill
   git remote set-url origin git@github.com:Tyagi221B/AstraBill.git
   git pull   # should auth via the deploy key, no password prompt
   ```

After that, `git pull` on the droplet works forever without PATs. **This
setup is queued, not done — current deploys still use a fresh PAT each
time.**

## Common operations

```bash
# Restart pdf-service after a code change (most common)
cd /opt/astrabill && git pull
cd deploy && docker compose up -d --build pdf-service

# Tail logs
docker compose logs -f --tail=100 pdf-service

# Hard restart (no rebuild — e.g. picking up a new .env value)
docker compose restart pdf-service

# Container state
docker compose ps

# Edit env vars (PDF_SERVICE_TOKEN, etc.)
nano deploy/.env
docker compose up -d pdf-service   # picks up new env on restart

# Caddy config change (e.g. add another service block)
nano deploy/Caddyfile
docker compose up -d caddy

# Full stack down (for maintenance) — leaves volumes intact
docker compose down

# Full stack down + WIPE VOLUMES (loses TLS certs — re-issued on next start)
docker compose down -v
```

## Cost watch

A single $12/mo droplet (basic AMD, 2 GB / 1 vCPU / 25 GB) runs:
- Caddy (TLS reverse proxy, negligible RAM)
- pdf-service (Puppeteer + a long-lived Chromium — the heavy one;
  steady ~250 MB RAM, peaks ~600 MB during a complex render)

Headroom for the V1.x additions (Redis + cron worker) is comfortable on
this size. Bump to 4 GB only when a single PDF render starts OOMing
Chromium, OR when adding a 4th service.

## Related pages

- [[decision/infrastructure]] — why Vercel + DO + Cloudinary + Supabase
- [[decision/pdf-generation]] — why PDF runs on a long-lived droplet, not serverless
- [[decision/notifications-and-crons]] — future Redis + BullMQ worker on this same droplet
