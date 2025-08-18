// Fix field without label
async function fixField() {
  // Login
  const loginResponse = await fetch('http://localhost:3001/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'megafeira2025', action: 'login' })
  })
  
  const { token } = await loginResponse.json()
  
  // Delete the problematic field
  console.log('Deleting field without label...')
  const deleteResponse = await fetch('http://localhost:3001/api/admin/fields?id=36fb6744-7106-48d1-b3e5-c5897f28a03f', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  console.log('Delete response:', deleteResponse.status)
  
  if (deleteResponse.ok) {
    console.log('Field deleted successfully!')
  } else {
    const error = await deleteResponse.json()
    console.log('Error:', error)
  }
}

fixField().catch(console.error)