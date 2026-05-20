# SignPath Foundation — Open Source Application

Guía y texto preparado para solicitar firma de código **gratuita** a SignPath
Foundation para EclesiaPresenter.

---

## 1. Antes de aplicar — checklist

- [x] **Licencia OSI** en raíz del repo (`LICENSE`, MIT) ✅
- [x] **Repositorio público** en GitHub (`Juanalejo01/eclesia-presenter`) ✅
- [x] **README.md** con descripción clara del proyecto ✅
- [x] **Releases publicadas** (visible en GitHub Releases) ✅
- [x] **Website / landing** del proyecto (`https://eclesia-presenter.vercel.app`) ✅
- [x] **Workflow de CI** que construye binarios reproducibles ✅
- [ ] **Cuenta en SignPath.io** (la creas durante el formulario)

---

## 2. URL del formulario

👉 **https://signpath.org/apply**

> ⚠️ **Importante — no confundir 2 servicios con nombre parecido:**
>
> - **`signpath.org`** = SignPath **Foundation** — la fundación sin ánimo
>   de lucro que da certificados **GRATIS** a OSS verificado. **AQUÍ es
>   donde tienes que aplicar.**
> - **`signpath.io` / `app.signpath.io`** = SignPath GmbH — empresa
>   **COMERCIAL** (~300 €/mes). Si te logueaste aquí por error y te
>   pide crear un "self-signed certificate" en la "Guided introduction",
>   **NO lo hagas** — ese flujo es para clientes de pago.
>
> Si ya creaste cuenta en el lado comercial por error, no la borres pero
> tampoco sigas su onboarding. Cuando Foundation te apruebe te enlazan a
> la cuenta sponsoreada (mismo dashboard `app.signpath.io`, billing
> distinto).

---

## 3. Datos a rellenar

### Sección "About you"

| Campo | Valor |
|---|---|
| First name | Juan Ángel |
| Last name | (tu apellido completo) |
| Email | juanangeloti771@gmail.com |
| Country | Spain |
| Role | Project Maintainer |

### Sección "About your project"

| Campo | Valor |
|---|---|
| Project name | EclesiaPresenter |
| Project website | https://eclesia-presenter.vercel.app |
| Source code repository | https://github.com/Juanalejo01/eclesia-presenter |
| License | MIT |
| Project age | (la fecha del primer commit — comprobable en GitHub) |

### "Project description" (campo grande)

Copia/pega exactamente esto:

```
EclesiaPresenter is a free and open-source church presentation software for
Windows, macOS, and Linux. It is the modern, open-source alternative to
commercial tools like ProPresenter and EasyWorship, specifically designed
for Spanish-speaking churches.

Built with Electron 29, React 18, and Vite, it provides:

- Multi-version Bible with offline JSON support (RVR 1909, NVI, DHH, LBLA,
  NTV, PDT, TLA) and online API fallback (api.bible).
- Song library with structured templates (verse/chorus/bridge), SQLite
  persistence (better-sqlite3), and optional cloud sync via Supabase.
- Service planner with drag-and-drop reordering and live navigation.
- Dual projection windows: full-screen for the physical projector and
  transparent overlay for OBS capture/streaming.
- Customizable theme engine (gradient/image/video backgrounds, typography,
  fade/slide/zoom transitions).
- Broadcast PGM/PVW monitor with "take to air" semantics.
- Stage Display v2 with presenter notes and integrated countdown.
- Built-in HTTP server for mobile remote control over LAN.
- Curated CC0 background video library (56 worship-friendly Pexels clips).

The project is actively maintained as a free alternative for churches that
cannot afford the $500/year commercial licenses. It is distributed as
unsigned Windows executables today, which causes Microsoft SmartScreen to
display warning dialogs that scare away church staff (most of whom are
non-technical volunteers). Code signing through SignPath would dramatically
reduce installation friction and allow the project to reach its target
audience without being mistakenly flagged.

A Pro tier (cloud sync + cross-PC sync) is offered via Stripe to sustain
development, while the core software remains MIT-licensed and free.
```

### "Why do you need code signing?"

```
Our users are church volunteers — pastors, worship leaders, and AV
technicians — who are typically non-technical and easily discouraged by
Windows SmartScreen "Unrecognized publisher" warnings. Several users have
reported abandoning the installation after seeing the red warning dialog.

Code signing would:

1. Remove the SmartScreen "Unrecognized publisher" warning for users
   downloading from our official website (https://eclesia-presenter.vercel.app).
2. Allow the installer to be distributed through corporate church networks
   that block unsigned executables by policy.
3. Provide cryptographic proof that the binary has not been tampered with
   in transit (mirrors, CDNs, etc.).
4. Increase user trust, which directly translates to more adoption in our
   target community.

We are unable to afford a commercial EV code-signing certificate (~$300/yr)
on our current sustainability model, and an OV certificate would still
require months of reputation building before SmartScreen stops warning.
SignPath Foundation's free certificates are recognized immediately by
SmartScreen due to their established reputation.
```

### "Expected release frequency"

```
Approximately one release every 2-4 weeks during active development,
moving to monthly stable releases once the project reaches v1.0.

Releases are automated via GitHub Actions on tag push (vX.Y.Z) and built
reproducibly on `windows-latest` runners. The workflow at
`.github/workflows/release.yml` shows the exact build process.
```

### "Maintainers"

```
Juanalejo01 (sole maintainer at the moment, open to contributors)
GitHub: https://github.com/Juanalejo01
```

### Términos y condiciones

Acepta los términos de SignPath Foundation (son OSS-friendly).

---

## 4. Tras enviar

- Recibirás un email de confirmación inmediato.
- **Tiempo de revisión**: 5-15 días laborables. SignPath revisa manualmente
  cada aplicación para evitar firmar malware.
- Si necesitan más info te contactan por email.
- Cuando aprueben recibirás:
  - URL de tu organización en SignPath: `https://app.signpath.io/Web/<org-id>`
  - Un Project Slug (probablemente `eclesia-presenter`)
  - Una Signing Policy Slug (probablemente `release-signing`)
  - Un API token para CI

---

## 5. Tras la aprobación — configurar GitHub Actions

Ver `docs/CODE_SIGNING.md` sección "Configuración post-aprobación".

Necesitarás añadir estos secrets/vars en GitHub:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `SIGNPATH_API_TOKEN` | Token que SignPath te da |
| Variable | `SIGNPATH_ORG_ID` | UUID de tu org (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| Variable | `SIGNPATH_ENABLED` | `true` |

Una vez configurados, el siguiente `git tag v0.2.1 && git push --tags`
saldrá firmado automáticamente.

---

## 6. Si te rechazan

Casi nunca pasa con proyectos OSS legítimos pero por si acaso:

- Pregunta por email el motivo específico.
- Common rechazos:
  - Repo demasiado nuevo (< 30 días) → espera y reaplica
  - License no clara → revisa que `LICENSE` esté en raíz
  - Sin releases → publica al menos una `v0.x.x` en GitHub Releases
- **Plan B**: pasar directo a Azure Trusted Signing en cuanto cobres
  (~10 €/mes, aprobación instantánea, ver `CODE_SIGNING.md` sección
  "Phase 2").
