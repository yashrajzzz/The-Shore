import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function updateAdmin() {
  console.log('Updating admin user with display name...')
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers()
  
  if (usersError) {
    console.error('Failed to get users:', usersError.message)
    return
  }

  const adminUser = usersData.users.find(u => u.email === 'admin@roomamp.local')
  if (!adminUser) {
    console.log('Admin user not found')
    return
  }

  const { data, error } = await supabase.auth.admin.updateUserById(adminUser.id, {
    user_metadata: { display_name: 'Admin' }
  })
  
  if (error) {
    console.error('Update failed:', error.message)
  } else {
    console.log('Success! Admin user updated to have display_name: "Admin"')
  }
}

updateAdmin()
