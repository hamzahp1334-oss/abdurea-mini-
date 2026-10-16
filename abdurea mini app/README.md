# 🚀 ABDUREA STORE — Deployable Telegram Mini App for Vercel

This folder contains the complete, deployable **Telegram Mini App** for **ABDUREA STORE** with zero external web admin needed.

---

## 👑 In-App Admin Authorization
Admin access is granted **strictly & automatically** to authorized Telegram IDs inside the Mini App:
- **Authorized Admin Telegram IDs:** `6666443909`, `2145055956`
- **Authorized Admin Usernames:** `@trust994`, `@hamzu3`

### When Opened by Store Admin:
- Automatic `👑 ADMIN` pill in header.
- `➕ Add New Product to Store` button at the top of Home and Catalog tabs.
- `✏️ Edit` and `🗑️ Delete` buttons on each product card.
- `👑 ADMIN MODE` banner with in-place editor in product details.
- Full Store Owner Administration panel in the Profile tab.

### When Opened by Any Other Customer:
- Clean, beautiful store view with **ZERO admin buttons**.
- **No password prompts or PIN inputs** anywhere.
- Admin REST API endpoints reject unauthorized users with `403 Forbidden`.

---

## ⚡ How to Deploy to Vercel

### Method 1: GitHub Integration (Recommended)
1. Push the contents of this folder directly to your GitHub repository (e.g. `hamzahp1334-oss/abdurea-mini-app`).
2. In your Vercel Project Settings:
   - **Root Directory:** Keep empty or `./`.
3. Vercel will automatically build and deploy `api/index.py`.
4. Your Mini App will be live at: `https://abdurea-mini-app.vercel.app/`!

### Method 2: Vercel CLI
```bash
npm i -g vercel
vercel
vercel --prod
```

---

## 🌐 URLs Served by This Deployment
| URL | Description |
| :--- | :--- |
| `/` or `/miniapp` | Telegram Mini App SPA (Light Mode, Pure UI) |
| `/healthz` | System health check (`{"status": "ok"}`) |
| `/api/miniapp/*` | Catalog, checkout, orders, and admin APIs |
