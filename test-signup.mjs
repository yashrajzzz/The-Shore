import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use admin key to bypass rate limits
)

async function testSignup() {
  console.log('Force creating admin user...')
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@roomamp.local',
    password: 'password123',
    email_confirm: true // Auto-confirm the email
  })
  
  if (error) {
    console.error('Admin signup failed:', error.message)
  } else {
    console.log('Success! User forcefully created with ID:', data.user?.id)
    console.log('Email: admin@roomamp.local')
    console.log('Password: password123')
  }
}

testSignup()
