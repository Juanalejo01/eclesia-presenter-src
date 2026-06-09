# Mobile CI — Build & Release del APK Android

Guía operativa del workflow `.github/workflows/release-mobile.yml`, que construye
y publica el APK del cliente mobile (Capacitor 6) cada vez que se hace push de
un tag `mobile-vX.Y.Z`.

> El scheme `mobile-v*` es **disjoint** del scheme `v*` que dispara `release.yml`
> (Electron desktop). Ambos workflows nunca se solapan sobre el mismo tag.

---

## 1. Overview

| Aspecto | Valor |
| --- | --- |
| Trigger automático | `push` de un tag que matchee `mobile-vX.Y.Z` |
| Trigger manual | `workflow_dispatch` con input `tag` requerido |
| Runner | `ubuntu-latest` (timeout 30 min) |
| Output | APK Android subido al GitHub Release del tag |
| JDK | Temurin 17 |
| Node | 22 |
| Android SDK | platforms;android-34, build-tools;34.0.0 |

---

## 2. Modos de build

El workflow corre en uno de dos modos según los secrets configurados:

### Modo RELEASE (firmado)

Activo cuando los **4 secrets** están presentes:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Output: `EclesiaPresenter-mobile-vX.Y.Z-release.apk` (firmado con tu keystore).
Instalable como upgrade del release firmado anterior y publicable en Play Store.

### Modo DEBUG (fallback)

Activo cuando **falta alguno** de los 4 secrets.

Output: `EclesiaPresenter-mobile-vX.Y.Z-debug.apk` (firmado con el debug
keystore autogenerado de Android). Instalable para testing pero **NO** como
upgrade del release firmado (firmas distintas).

El job summary indica explícitamente el modo usado con un bloque markdown.

---

## 3. Generar el keystore localmente

Sólo necesitas hacerlo **una vez** para el ciclo de vida de la app. Si la pierdes
después de publicarla en Play Store, **no podrás actualizar la app jamás**.

```bash
keytool -genkeypair -v \
  -keystore eclesiapresenter-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias eclesia-mobile
```

`keytool` te preguntará:

1. **Enter keystore password** → mínimo 6 caracteres. Anótala (gestor de
   contraseñas: 1Password, Bitwarden, etc.). Esto será el valor de
   `ANDROID_KEYSTORE_PASSWORD`.
2. **Re-enter new password** → la misma.
3. **First and last name** → ej. `EclesiaPresenter`.
4. **Organizational unit** → ej. `Mobile`.
5. **Organization** → ej. `EclesiaPresenter`.
6. **City or Locality** → ej. `Madrid`.
7. **State or Province** → ej. `Madrid`.
8. **Two-letter country code** → ej. `ES`.
9. **Is CN=... correct?** → `yes`.
10. **Enter key password for `<eclesia-mobile>`** → pulsa Enter para usar la
    misma que el keystore (recomendado). Esto será el valor de
    `ANDROID_KEY_PASSWORD` (igual a `ANDROID_KEYSTORE_PASSWORD` si pulsaste
    Enter).

Verifica el alias:

```bash
keytool -list -keystore eclesiapresenter-release.jks
```

Debes ver el alias `eclesia-mobile` listado. Esto será el valor de
`ANDROID_KEY_ALIAS`.

> **Seguridad**: guarda el archivo `.jks` en un lugar seguro (gestor de
> contraseñas con adjuntos, vault cifrado). Nunca lo subas al repo.

---

## 4. Codificar el keystore a base64

El secret `ANDROID_KEYSTORE_BASE64` debe ser **una sola línea** sin saltos.

### Linux / macOS

```bash
base64 -w 0 eclesiapresenter-release.jks > keystore.b64
```

### PowerShell (Windows)

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('eclesiapresenter-release.jks')) `
  | Out-File keystore.b64 -Encoding ASCII -NoNewline
```

Abre `keystore.b64` y copia **todo el contenido** (es un blob largo). Ese será
el valor del secret `ANDROID_KEYSTORE_BASE64`.

> El archivo `keystore.b64` está cubierto por `mobile/android/.gitignore`
> (patrón `*.b64`). Bórralo después de subir el secret.

---

## 5. Cargar los 4 secrets en GitHub

Navega a:

```
https://github.com/<org-o-user>/<repo>/settings/secrets/actions/new
```

Crea **exactamente** estos 4 secrets (nombres case-sensitive):

| Nombre | Valor |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | El contenido completo de `keystore.b64` (una línea). |
| `ANDROID_KEYSTORE_PASSWORD` | La contraseña del keystore (paso 3.1). |
| `ANDROID_KEY_ALIAS` | `eclesia-mobile` (o el alias que pasaste a `-alias`). |
| `ANDROID_KEY_PASSWORD` | La contraseña de la key (paso 3.10). |

`GITHUB_TOKEN` se provee automáticamente por Actions y no requiere creación.

---

## 6. Verificación del setup

Después de cargar los secrets, dispara un build con un tag de prueba:

```bash
git tag mobile-v0.1.0 -m "Primer release mobile firmado"
git push origin mobile-v0.1.0
```

En la pestaña Actions, abre el run del workflow `Mobile Build & Release`. El
step `Check signing secrets` debe loguear:

```
Signing secrets detectados — build mode: RELEASE firmado.
```

El job summary muestra al final:

```
### Build mode: RELEASE (firmado)

APK generado: EclesiaPresenter-mobile-v0.1.0-release.apk
```

Y el Release del tag tendrá adjunto el APK firmado.

---

## 7. Tag scheme

| Scheme | Workflow | Plataforma |
| --- | --- | --- |
| `v*` (ej. `v0.2.4`) | `.github/workflows/release.yml` | Electron desktop (Win + macOS) |
| `mobile-v*` (ej. `mobile-v0.1.0`) | `.github/workflows/release-mobile.yml` | Android APK |

Son disjoint: nunca dispares un tag que matchee ambos patrones.

---

## 8. Naming convention del APK final

| Modo | Nombre del APK |
| --- | --- |
| Release firmado | `EclesiaPresenter-mobile-vX.Y.Z-release.apk` |
| Debug fallback | `EclesiaPresenter-mobile-vX.Y.Z-debug.apk` |

---

## 9. Versionado

El step `Extract version from tag` aplica la regex
`^mobile-v([0-9]+)\.([0-9]+)\.([0-9]+)$` y deriva:

- `versionName` = `"X.Y.Z"` (literal del tag).
- `versionCode` = `major * 10000 + minor * 100 + patch`.

Ejemplos:

| Tag | versionName | versionCode |
| --- | --- | --- |
| `mobile-v0.0.5` | `0.0.5` | `5` |
| `mobile-v0.1.0` | `0.1.0` | `100` |
| `mobile-v1.2.3` | `1.2.3` | `10203` |

La fórmula soporta hasta `minor=99` y `patch=99` sin colisión.

Estos valores se inyectan con `sed -i` en `mobile/android/app/build.gradle`
antes de gradle. Los valores hardcodeados (`versionCode 1` / `versionName "1.0"`)
siguen siendo válidos como fallback para `cap:run:android` en dev local.

---

## 10. Troubleshooting

### `keystore was tampered with, or password was incorrect`

- La contraseña en `ANDROID_KEYSTORE_PASSWORD` no coincide con la del `.jks`.
- O el base64 está corrupto (saltos de línea, espacios, codificación errónea).
- Re-codifica con `base64 -w 0` (Linux/macOS) o `[Convert]::ToBase64String` con
  `-NoNewline` (PowerShell). El blob debe ser **una línea**.

### `Cannot recover key`

- `ANDROID_KEY_PASSWORD` no coincide con la contraseña de la key.
- Si pulsaste Enter en el prompt de `keytool` para reusar la del keystore, el
  valor debe ser idéntico a `ANDROID_KEYSTORE_PASSWORD`.

### `Keystore file does not exist`

- El step `Decode keystore` falló silenciosamente. Revisa el log del step para
  ver si el blob de base64 estaba vacío.

### `Tag '<x>' no matchea el patrón mobile-vX.Y.Z`

- El regex solo acepta dígitos. Sufijos como `-rc1`, `-beta` no son válidos en
  T14 (pueden añadirse en el futuro con un regex extendido).

### El APK debug se publica aunque los secrets están cargados

- Verifica que **los 4 secrets** existen en
  `Settings → Secrets and variables → Actions`. Si falta uno, el step
  `Check signing secrets` cae en el modo debug.

### Build falla con `Could not find tools.jar`

- El runner está usando JDK 8 en vez de 17. El workflow declara
  `java-version: '17'` con `actions/setup-java@v4`; verifica que ese step no
  fue modificado.

---

## 11. Seguridad

- **NUNCA** commitear el `.jks`, `keystore.b64`, `keystore.properties`,
  `release.keystore`, ni `signing.gradle`. Todos están cubiertos por
  `mobile/android/.gitignore`.
- Los secrets en GitHub Actions están cifrados y nunca aparecen en logs (Actions
  los enmascara automáticamente con `***`).
- Si sospechas que el keystore se filtró, **NO** rotes la key sin antes leer
  la sección 12.

---

## 12. Rotación del keystore

**NO rotar** el keystore una vez publicada la app en Play Store. Android
identifica las apps por la firma del keystore: si cambias el keystore, los
usuarios no pueden actualizar la app — solo pueden desinstalar y reinstalar,
perdiendo todo el estado local.

Si necesitas rotar antes de publicar en Play Store (solo distribución por
sideload), genera un nuevo keystore, actualiza los 4 secrets y comunica a tus
testers que deben desinstalar la versión anterior.

Si ya estás en Play Store y necesitas rotar por compromiso de seguridad, la
única vía es habilitar **Play App Signing key upgrade** desde la consola de
Play Store antes de que ocurra el incidente. No hay vía de recuperación a
posteriori.

---

## 13. Nota sobre `mobile/android/`

`mobile/android/` está incluido en `mobile/.gitignore`, así que **no se commitea**
al repo. El workflow regenera la plataforma cada run con `npx cap add android`
(idempotente: si ya existe localmente, no-op) seguido de `npx cap sync android`.
Los patches de `versionCode`/`versionName` y la inyección de `signing.gradle` se
aplican sobre el árbol generado en CI, no sobre archivos versionados.

Si en el futuro decides commitear `mobile/android/`, el step
`Ensure android platform exists` detectará la carpeta y saltará el `cap add`.

---

## 14. Referencias

- Workflow: [`.github/workflows/release-mobile.yml`](../.github/workflows/release-mobile.yml)
- Capacitor config: [`mobile/capacitor.config.json`](../mobile/capacitor.config.json)
