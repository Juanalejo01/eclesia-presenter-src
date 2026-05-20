# Code Signing — EclesiaPresenter

Cómo se firman los binarios de EclesiaPresenter para Windows.

---

## Estrategia en 2 fases

| Fase | Cuándo | Quién firma | Coste | Velocidad reputación |
|---|---|---|---|---|
| **Phase 1** — SignPath OSS | Hoy (esperando aprobación) | SignPath Foundation | Gratis | Inmediato (cert con reputación heredada) |
| **Phase 2** — Azure Trusted Signing | Mes que viene (cuando cobre) | Microsoft | ~10 €/mes + pay-per-sign | Inmediato (cert de Microsoft) |

Pasar a Phase 2 cuando esté el presupuesto no es estrictamente necesario — SignPath
cubre el caso de uso completo. Pero Azure Trusted Signing tiene 2 ventajas:
(a) la cadena de confianza es directamente de Microsoft, (b) menos dependencia
en una organización externa (SignPath puede cambiar políticas).

---

## Phase 1 — SignPath Foundation (gratis para OSS)

### 1.1. Aplicar

Ver `docs/SIGNPATH_APPLICATION.md` — tiene el formulario pre-rellenado.

### 1.2. Mientras esperan revisión

El workflow `.github/workflows/release.yml` ya está preparado para firmar.
La firma se **gatea** por una variable de repo:

```
vars.SIGNPATH_ENABLED == 'true'
```

Si la variable no existe (o es distinta de `'true'`), el job de firma se
salta y el release sale sin firmar — comportamiento actual. Esto permite
mergear el cambio hoy sin romper releases.

### 1.3. Configuración post-aprobación

Cuando SignPath apruebe el proyecto recibirás 3 datos por email:

1. **Organization ID** — UUID tipo `12345678-1234-1234-1234-123456789012`
2. **Project slug** — texto corto, probablemente `eclesia-presenter`
3. **Signing policy slug** — texto corto, probablemente `release-signing`

Y crearás un **API token** desde el panel web de SignPath
(`https://app.signpath.io/Web/<org-id>/Settings/CiUserTokens`).

#### Configurar GitHub

Ir a `Settings → Secrets and variables → Actions` del repo y añadir:

**Secret** (encriptado, no visible tras guardar):
| Nombre | Valor |
|---|---|
| `SIGNPATH_API_TOKEN` | El token de SignPath |

**Variables** (texto plano, visibles tras guardar):
| Nombre | Valor |
|---|---|
| `SIGNPATH_ORG_ID` | El Organization ID UUID |
| `SIGNPATH_PROJECT_SLUG` | `eclesia-presenter` |
| `SIGNPATH_POLICY_SLUG` | `release-signing` |
| `SIGNPATH_ENABLED` | `true` |

#### Configurar SignPath (en su panel)

En `https://app.signpath.io/Web/<org-id>/Projects/eclesia-presenter`:

1. **Artifact Configuration** → crear una config nueva con tipo
   "Electron app". Subir un ZIP de ejemplo (`dist-electron/win-unpacked/`)
   para que SignPath aprenda la estructura. Marcar como firmables:
   - `EclesiaPresenter.exe`
   - `resources/elevate.exe`
   - `*.dll` dentro de `resources/`
2. **Signing Policy** → "release-signing":
   - Trigger: GitHub Actions
   - Repository: `Juanalejo01/eclesia-presenter`
   - Approvers: solo tú (auto-approve)
3. **Verify origin** → conectar el repo via GitHub App de SignPath.

### 1.4. Probar la firma

Tras configurar todo:

```powershell
# Localmente: bump version
npm version patch  # 0.2.0 → 0.2.1

# Push del tag → dispara el workflow firmado
git push --tags
```

El workflow:
1. Construye `EclesiaPresenter-0.2.1-portable.exe` y `-setup.exe` (sin firma)
2. Los sube a SignPath como artifact
3. SignPath los firma y los devuelve
4. Los binarios firmados se publican en la Release de GitHub

### 1.5. Verificar firma local

```powershell
Get-AuthenticodeSignature dist-electron\EclesiaPresenter-0.2.1-setup.exe | `
  Format-List Status, SignerCertificate
```

Debe mostrar `Status: Valid` y un cert de "SignPath Foundation".

---

## Phase 2 — Azure Trusted Signing (futuro, ~10 €/mes)

### 2.1. Por qué cambiar

- Cert emitido directamente por Microsoft (no por un tercero).
- Sin riesgo de revocación por cambio de política de SignPath.
- Integración nativa con Microsoft 365 / Defender.

### 2.2. Cómo activarlo

1. Crear cuenta Azure (free trial 200 € de créditos los primeros 30 días).
2. Crear un recurso "Trusted Signing Account":
   ```bash
   az trustedsigning create \
     --resource-group "eclesia-rg" \
     --account-name "eclesia-signing" \
     --location "westeurope" \
     --sku-name "Basic"
   ```
3. Crear "Certificate Profile" tipo `Public Trust`.
4. Verificar identidad (KYC con DNI + selfie, ~24-48 h).
5. Crear un Service Principal con permiso `Trusted Signing Certificate Profile Signer`.

### 2.3. Cambiar el workflow

Reemplazar el step `signpath/github-action-submit-signing-request@v1` por:

```yaml
- name: Sign with Azure Trusted Signing
  uses: azure/trusted-signing-action@v0.5
  with:
    azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
    azure-client-secret: ${{ secrets.AZURE_CLIENT_SECRET }}
    endpoint: https://weu.codesigning.azure.net/
    trusted-signing-account-name: eclesia-signing
    certificate-profile-name: eclesia-public-trust
    files-folder: dist-electron
    files-folder-filter: exe
    file-digest: SHA256
    timestamp-rfc3161: http://timestamp.acs.microsoft.com
    timestamp-digest: SHA256
```

Toda la lógica de retries y wait-for-completion la maneja la action.

### 2.4. Coste estimado

Microsoft cobra **0.10 € por firma** + Basic SKU **9.99 €/mes**.

Con 2 releases/mes × 2 archivos firmados (portable + setup) = 4 firmas/mes
= 0.40 € extra + 9.99 € = **~10.40 €/mes**.

---

## Estado actual del workflow

`.github/workflows/release.yml`:

- ✅ Se dispara en `push` de tag `v*` o manualmente
- ✅ Build en Windows + macOS
- ✅ Sube binarios a GitHub Release
- ✅ **Paso de firma con SignPath** (gateado por `vars.SIGNPATH_ENABLED`)
- ⏳ Phase 2 (Azure) — pendiente de cambio cuando se contrate

---

## Troubleshooting

### "SignPath: no signing policy found"

→ Verifica que el slug en `SIGNPATH_POLICY_SLUG` coincide exactamente con
el creado en el panel de SignPath (case-sensitive, kebab-case).

### "Error: artifact is too large"

→ SignPath OSS limita artifacts a ~1 GB. Nuestros .exe son ~86 MB, sin
problema. Pero si en el futuro empaquetamos los videos preset directamente
en el .exe, hay que dejar la descarga bajo demanda como está.

### "Authenticode signature is broken after rcedit"

→ El orden importa: **primero firma, después rcedit no debe correr**.
El workflow ya hace `embed-icon.mjs` ANTES del empaquetado portable/setup
y la firma se aplica al final, así no hay conflicto.

### "GitHub Action times out at 'wait-for-completion'"

→ Por defecto espera 30 min. Si SignPath está lento (raro), aumenta:
```yaml
with:
  wait-for-completion-timeout-in-seconds: 3600
```

---

## Referencias

- SignPath Foundation OSS: https://signpath.org/apply
- SignPath comercial (NO usar para OSS): https://signpath.io
- GitHub Action: https://github.com/SignPath/github-action-submit-signing-request
- Azure Trusted Signing: https://learn.microsoft.com/en-us/azure/trusted-signing/
- Electron + code signing: https://www.electron.build/code-signing
