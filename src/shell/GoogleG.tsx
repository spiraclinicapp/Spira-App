/* La "G" de Google en sus 4 colores oficiales. Es marca de un tercero: por eso va con color fijo
   (no hereda currentColor) y vive aparte del set de línea de Icon.tsx. */

interface GoogleGProps {
  size?: number
}

export function GoogleG({ size = 18 }: GoogleGProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h13.2c-.6 3-2.3 5.6-4.9 7.3v6h7.9c4.6-4.3 7.3-10.5 7.3-17.8z" />
      <path fill="#34A853" d="M24 48c6.5 0 12-2.2 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.8H2.5v6.2C6.5 42.6 14.6 48 24 48z" />
      <path fill="#FBBC05" d="M10.6 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7v-6.2H2.5C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.9l8.1-6.2z" />
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.5 13.1l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
    </svg>
  )
}
