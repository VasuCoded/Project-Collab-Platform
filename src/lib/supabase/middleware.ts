import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() verifies the JWT locally under asymmetric signing keys, so the
  // common "already signed in" case costs no auth-server round-trip. It falls
  // back to a network call only for legacy HS256 keys, so this is never slower
  // or less safe than getUser(). Matters here more than anywhere else: this runs
  // on every request before rendering starts.
  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getClaims()
    const sub = data?.claims?.sub
    if (sub) user = { id: sub as string }
  } catch {
    // fall through to getUser()
  }
  if (!user) {
    const {
      data: { user: fetched },
    } = await supabase.auth.getUser()
    user = fetched ? { id: fetched.id } : null
  }

  const path = request.nextUrl.pathname
  const code = request.nextUrl.searchParams.get('code')

  if (code && !path.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    if (user) {
      url.searchParams.delete('code')
    } else {
      url.pathname = '/auth/callback'
    }
    return NextResponse.redirect(url)
  }

  const isPublic = path === '/' || path.startsWith('/login') || path.startsWith('/auth')
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
