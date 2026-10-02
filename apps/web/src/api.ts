export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json === undefined ? rest.headers : { 'Content-Type': 'application/json', ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? res.statusText, res.status)
  return data as T
}

export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'user'
}

export interface AdminUser extends User {
  disabled: number
  createdAt: string
}
