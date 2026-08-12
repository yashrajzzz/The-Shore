'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  if (!data.email || !data.password) {
    return { error: 'Email and password are required' }
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const displayName = formData.get('display_name') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  if (!displayName || displayName.trim().length === 0) {
    return { error: 'Display name is required' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName.trim(),
      }
    }
  })

  if (error) {
    return { error: error.message }
  }

  // Check if email confirmation is required
  // When auto-confirm is OFF, the user object exists but session is null
  if (data?.user && !data?.session) {
    return { error: null, needsConfirmation: true }
  }

  revalidatePath('/', 'layout')
  return { error: null, needsConfirmation: false }
}
