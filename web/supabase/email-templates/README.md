# Email templates de EclesiaPresenter

Plantillas HTML para los correos transaccionales que envia Supabase Auth.

## Como aplicar

1. Entra a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard).
2. Ve a **Authentication -> Emails** (o **Email Templates** segun version).
3. Selecciona la plantilla **Magic Link** (es la que dispara `signInWithOtp`).
4. Copia el contenido completo de `verification-code.html` y pegalo en el
   editor de la plantilla.
5. En el campo **Subject** (asunto) pon:
   ```
   Tu codigo de verificacion - EclesiaPresenter
   ```
6. Guarda.

## Importante: codigo de 6 digitos

La web ahora verifica con **codigo de 6 digitos** (no enlace magico). El
template usa la variable `{{ .Token }}` que Supabase rellena con el codigo.

Para que el flujo funcione end-to-end:
- La web llama a `signInWithOtp({ email })` (envia el email).
- El usuario teclea el codigo en la web.
- La web llama a `verifyOtp({ email, token, type: 'email' })`.

Ya esta implementado en `web/app/register/register-form.jsx` y
`web/app/login/login-form.jsx`.

## Configuracion de expiracion

En **Authentication -> Providers -> Email** puedes ajustar:
- **OTP Expiry**: 3600 segundos (60 min) recomendado. El template lo menciona.
- **OTP Length**: 6 digitos (por defecto).

## Compatibilidad

El HTML usa tablas + CSS inline porque Gmail, Outlook y Apple Mail NO
soportan `<style>` en `<head>` ni flexbox. Probado en:
- Gmail web + app movil
- Outlook desktop (con fallback MSO)
- Apple Mail

## Variables disponibles en los templates de Supabase

| Variable | Que es |
|---|---|
| `{{ .Token }}` | Codigo OTP de 6 digitos |
| `{{ .ConfirmationURL }}` | Enlace magico (fallback, no lo usamos) |
| `{{ .SiteURL }}` | URL base de la web |
| `{{ .Email }}` | Email del destinatario |
| `{{ .TokenHash }}` | Hash del token (para construir URLs custom) |
