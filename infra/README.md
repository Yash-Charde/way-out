# infra/ — Vultr VM + Caddy + three API environments (P-04)

## Go-live checklist (P-04, about 20 minutes)

**Owners since Sat 3:45 PM:** steps 1–5 are **Aarya** (A-13). Steps 5–9 are **Yash** (D2-10), because only the repo owner can add Actions secrets or connect Vercel to a personal repo. Prem approves `staging → main` from his phone.

Do these in order. Each line says how you know it worked.

1. **Atlas** *(Aarya)*: one M0 cluster → Database Access: a user → Network Access: `0.0.0.0/0` → Connect → copy the
   `mongodb+srv://...` URI. The three databases (`wayout_dev`, `wayout_staging`, `wayout_prod`) are created
   on first write; `ENV` picks which one.
2. **secrets.env** *(Aarya)* on your laptop: copy `.env.example`, fill in `MONGODB_URI`, `INTERNAL_TOKEN` (`openssl rand -hex 24`)
   and whatever keys you have now (Gemini, Anthropic, Cartesia, FIRMS, TinyFish). Never commit it.
3. **Vultr VM** *(Aarya)*: Ubuntu 24.04, 2 vCPU / 4 GB, your SSH key. Then:
   ```bash
   scp infra/bootstrap-vm.sh secrets.env root@<VM_IP>:/tmp/
   ssh root@<VM_IP> 'bash /tmp/bootstrap-vm.sh <domain> /tmp/secrets.env'
   ```
   Installs Docker, opens 22/80/443, writes `/opt/wayout/.env` and `dev|staging|prod.env` (mode 600).
4. **DNS** *(Aarya)* (registrar or Cloudflare, proxy **off**): A records `api-dev`, `api-staging`, `api` → VM IP.
   `dig +short api-dev.<domain>` returns the IP.
5. **GitHub secrets**: *(Aarya)* a deploy key just for CI: `ssh-keygen -t ed25519 -f wayout_deploy -N ''`, append
   `wayout_deploy.pub` to the VM's `~/.ssh/authorized_keys`, and send Yash the VM IP and `wayout_deploy` privately. *(Yash)* Repo → Settings → Secrets → Actions →
   **repository** secrets `VULTR_HOST` (IP), `VULTR_USER` (`root`), `VULTR_SSH_KEY` (contents of `wayout_deploy`).
   Repository secrets reach all three Environments, so you add them once.
6. **First deploy** *(Yash)*: Actions → **deploy** → Run workflow → `dev` (or push to `develop`). Green run, then
   `curl https://api-dev.<domain>/health` shows `"env":"dev"` and the sha. Repeat for `staging` and `prod`.
7. **Vercel** *(Yash)*: Add project → this repo → Root Directory `web`. Production branch `main`.
   Env var `NEXT_PUBLIC_API_URL`: Production = `https://api.<domain>`; Preview for branch `develop` =
   `https://api-dev.<domain>`; Preview for branch `staging` = `https://api-staging.<domain>`.
   Domains: `app.<domain>` → production, `dev.<domain>` → branch `develop`, `staging.<domain>` → branch `staging`
   (CNAME each to `cname.vercel-dns.com`).
8. **Check everything** *(Yash)*: `uv run --project api python scripts/smoke.py --domain <domain>` → all three envs green.
9. **`v0.0`** *(Yash, Prem)*: PR `develop → staging` and merge it. PR `staging → main`: Prem approves and merges from GitHub mobile. Then
   `git tag v0.0 origin/main && git push origin v0.0`.

## What bootstrap-vm.sh does (by hand, if you prefer)

```bash
curl -fsSL https://get.docker.com | sh
sudo mkdir -p /opt/wayout && sudo chown $USER /opt/wayout
cd /opt/wayout
cat > .env <<'X'
DOMAIN=<your-domain>
API_IMAGE=ghcr.io/yash-charde/wayout-api
X
# one secrets file per env, copied from .env.example (ENV is set by compose)
nano dev.env staging.env prod.env
```

## GitHub Environments (`dev`, `staging`, `production`)

The deploy job runs in the Environment for its branch. `VULTR_HOST`, `VULTR_USER`, `VULTR_SSH_KEY` can live
in each Environment or once as repository secrets (simplest, one VM). The deploy job logs the VM into GHCR
with the workflow's token, so the image can stay private.

## Deploy / rollback

Merging to `develop` / `staging` / `main` deploys `api-dev` / `api-staging` / `api-prod`.
Rollback: Actions → **deploy** → Run workflow → pick env + an older image tag (a git sha).

Check: `curl https://api-dev.<domain>/health` → `{"ok":true,"env":"dev","gitSha":"..."}`
