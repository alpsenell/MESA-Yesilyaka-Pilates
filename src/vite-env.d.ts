/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Domain for the synthetic resident login addresses. Optional. */
  readonly VITE_VILLA_EMAIL_DOMAIN?: string
  /** Domain for the synthetic admin login addresses. Optional. */
  readonly VITE_ADMIN_EMAIL_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
