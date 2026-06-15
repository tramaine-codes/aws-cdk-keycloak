# Local Federation Setup — Admin Console Steps

Configuration steps performed in the Keycloak admin consoles once both servers
are running. Assumes `upstream` (`https://upstream:8443`) and `downstream`
(`https://downstream:9443`) are up and you can log into both with the admin
account.

---

## Part 1 — Upstream (the IdP)

All steps in the **upstream** console (`https://upstream:8443`). Confirm the
realm selector reads `upstream-idp` (not `master`) before each step.

### 1. Create the realm

Realm dropdown → **Create realm** → name **`upstream-idp`** → **Create**.

This fixes the issuer at `https://upstream:8443/realms/upstream-idp`.

### 2. Create the OIDC client

**Clients** → **Create client**.

General settings:

- Client type: **OpenID Connect**
- Client ID: **`downstream-identity-broker`**
- **Next**

Capability config:

- **Client authentication: On** (confidential — generates the secret)
- Authorization: Off
- Authentication flow: **Standard flow** only (uncheck Direct access grants,
  Implicit, Service accounts)
- **Next**

Login settings:

- **Valid redirect URIs:**
  ```
  https://downstream:9443/realms/downstream-idp/broker/upstream-idp/endpoint
  ```
- Leave Root URL, Home URL, Web origins empty.
- **Save**, then confirm the redirect URI actually shows in the field.

### 3. Copy the handoff values

Client → **Credentials** tab → copy the **Client secret**.

The three values the downstream needs:

- **Client ID:** `downstream-identity-broker`
- **Client secret:** (from Credentials tab)
- **Discovery URL:**
  `https://upstream:8443/realms/upstream-idp/.well-known/openid-configuration`

### 4. Create a test user

**Users** → **Add user** → set username (`jdoe`) and email → **Create**.

Then **Credentials** tab → **Set password** → set a password → **Temporary:
Off**.

(Optional) **Details** tab → toggle **Email verified: On** — some downstream
first-broker-login flows trust `email_verified` for auto-linking.

### 5. (Optional) Verify the token before federating

Client → **Client scopes** tab → **Evaluate** sub-tab → select the test user →
inspect **Generated ID token**. Confirm `iss`, `sub` (UUID),
`preferred_username`, and `email` are present and correct.

---

## Part 2 — Downstream (the broker)

All steps in the **downstream** console (`https://downstream:9443`).

### 1. Create the realm

Realm dropdown → **Create realm** → name **`downstream-idp`** exactly →
**Create**.

### 2. Add the OpenID Connect identity provider

Inside `downstream-idp`: **Identity providers** → **OpenID Connect v1.0**.

- **Alias:** **`upstream-idp`** exactly (becomes the `{alias}` segment in the
  redirect URI — must match what was registered on the upstream client).
- **Discovery endpoint:** paste
  ```
  https://upstream:8443/realms/upstream-idp/.well-known/openid-configuration
  ```
  If trust and hostname are correct, Keycloak fetches it and auto-fills the
  endpoints.
- **Client ID:** `downstream-identity-broker`
- **Client Secret:** the secret copied from the upstream Credentials tab.
- Leave the rest default. **Save**.

---

## Part 3 — Test the brokered login

Go to the downstream account console:

```
https://downstream:9443/realms/downstream-idp/account
```

Choose **log in via `upstream-idp`**. Expected:

1. Redirect to the upstream login page.
2. Authenticate as `jdoe`.
3. (First login only) review-profile / account-linking screen — confirm through
   it.
4. Land in the downstream account console as `jdoe`.

A brokered shadow user is now provisioned in `downstream-idp`, keyed on the
upstream `sub` UUID.

---

## The three-value contract (why exact-match matters)

These must agree exactly across both sides or the login fails with
`Invalid parameter: redirect_uri`:

| Value           | Set on downstream                                  | Must match on upstream redirect URI |
| --------------- | -------------------------------------------------- | ----------------------------------- |
| Hostname + port | downstream's `KC_HOSTNAME` (`downstream:9443`)     | `https://downstream:9443/...`       |
| Realm           | the realm created on downstream (`downstream-idp`) | `.../realms/downstream-idp/...`     |
| Alias           | the IdP alias (`upstream-idp`)                     | `.../broker/upstream-idp/endpoint`  |
