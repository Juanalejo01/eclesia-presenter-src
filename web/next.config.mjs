/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El binario portable se sirve desde GitHub Releases; aquí solo redirigimos.
  async redirects() {
    return [
      {
        source: '/download/latest',
        destination: 'https://github.com/Juanalejo01/eclesia-presenter/releases/latest',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
