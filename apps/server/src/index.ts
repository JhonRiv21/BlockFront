export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/health') {
      return Response.json({ ok: true })
    }
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'not_found' }, { status: 404 })
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
