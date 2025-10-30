# Playwright Advanced Encryption

## Overview

The **Playwright Advanced Encryption** module is a **secure encryption and key rotation system** purpose-built for **Playwright automation frameworks**.
It ensures that sensitive credentials and secrets remain **protected**, **auditable**, and **compliant** within CI/CD pipelines.

---

## Key Features

* **AES-GCM encryption** with **Argon2-based key derivation**
* **Automatic key rotation** for enhanced long-term security
* **Environment-based secret handling** (isolated per environment)
* **Seamless Playwright integration** with minimal setup
* Keeps **secrets out of source control and test reports**
* **Metadata and audit tracking** for key lifecycle visibility

---

## Setup & Getting Started

### 1. Install Dependencies

Ensure **Node.js** is installed, then run:

```bash
npm install
```

### 2. Environment Configuration

All configurations are stored under the `envs/` directory and excluded from version control for security.

#### Steps

1. Open `.env.template`
2. Copy it to `.env.<env>` (e.g. `.env.qa`)
3. Fill in environment-specific credentials

Supported environments:
`dev`, `qa`, `uat`, `preprod`

#### Example `.env` file

```env
PORTAL_BASE_URL=https://portal.example.com
PORTAL_USERNAME=portal.user
PORTAL_PASSWORD=portal.password
```

---

## Encryption System

Sensitive credentials are encrypted using **AES-GCM**, with encryption keys derived via **Argon2** for strong cryptographic safety.

### Command Categories (Playwright Tags)

| Category       | Tag                | Description                              |
| -------------- | ------------------ | ---------------------------------------- |
| Key Generation | `@generate-key`    | Creates a new encryption key             |
| Encryption     | `@env-encryption`  | Encrypts environment variables           |
| Key Rotation   | `@key-rotation`    | Rotates expired keys                     |
| Batch Rotation | `@batch-rotation`  | Rotates all environments in one go       |
| Audit          | `@key-audit`       | Logs and verifies key rotation history   |
| Metadata       | `@metadata`        | Displays key metadata (hash, date, etc.) |
| Error Handling | `@error-handling`  | Ensures proper exception coverage        |
| Warning Status | `@status-warnings` | Displays upcoming expiry warnings        |

---

### Running Encryption Commands

To run encryption tasks, use Playwright with the appropriate tag:

```bash
npx cross-env SKIP_BROWSER_INIT=true PLAYWRIGHT_GREP=@<tag> ENV=<env> npm run test:encryption
```

> Replace `<env>` with one of: `dev`, `qa`, `uat`, `preprod`

#### Batch Rotation (all environments)

```bash
npx cross-env SKIP_BROWSER_INIT=true PLAYWRIGHT_GREP=@batch-rotation npm run test:encryption
```

---

### First-Time Setup Example (Dev Environment)

1. **Generate the encryption key:**

   ```bash
   npx cross-env SKIP_BROWSER_INIT=true PLAYWRIGHT_GREP=@generate-key ENV=dev npm run test:encryption
   ```

2. **Encrypt environment credentials:**

   ```bash
   npx cross-env SKIP_BROWSER_INIT=true PLAYWRIGHT_GREP=@env-encryption ENV=dev npm run test:encryption
   ```

> **Note:**
>
> * The rotation runs automatically whenever you execute encryption tests.
> * If a key is **expired**, it will **rotate automatically**.
> * If a key is **expiring within 7 days**, a **warning** is displayed.
> * You can also **manually trigger rotation**:

```bash
npx cross-env SKIP_BROWSER_INIT=true PLAYWRIGHT_GREP=@key-rotation ENV=dev npm run test:encryption
```

---

##  Timeout Configuration

Defined in
`src/configuration/timeouts/timeout.config.ts`

### Features

* Centralized `TimeoutManager` ensures consistent timeout values.

* Automatically scales for **CI/CD environments** via `EnvironmentDetector.isCI()`.

* Categorized configuration for different test layers:

  | Category | Purpose                |
  | -------- | ---------------------- |
  | `test`   | Test execution timeout |
  | `expect` | Assertion timeout      |
  | `api`    | External service calls |
  | `db`     | Database operations    |

* Dynamic timeout adjustments based on environment type.

---

## Code Quality & Standards

Code quality is enforced via pre-commit automation:

* **Husky** → Git hooks integration
* **Lint-Staged** → Lints only staged files
* **ESLint** → Strict TypeScript linting
* **Prettier** → Code formatting consistency

**Rules:**

* Only `console.warn` and `console.error` are allowed.
* Pre-configured **VS Code workspace settings** ensure consistent local development.

Config files:
`.prettierrc`, `.vscode/settings.json`, `eslint.config.mjs`

---