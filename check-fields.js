// Check fields in database
async function checkFields() {
  // Login
  const loginResponse = await fetch('http://localhost:3001/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'megafeira2025', action: 'login' })
  })
  
  const { token } = await loginResponse.json()
  
  // Get fields
  const response = await fetch('http://localhost:3001/api/admin/fields', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  const data = await response.json()
  
  console.log('Total fields:', data.fields.length)
  console.log('\nFields with issues:')
  data.fields.forEach(f => {
    if (!f.label || !f.fieldName) {
      console.log('- Problem field:', f)
    }
  })
  
  console.log('\nAll fields:')
  data.fields.forEach(f => {
    console.log(`- ${f.label || '(NO LABEL)'} (${f.fieldName}) - Type: ${f.type}`)
  })
}

checkFields().catch(console.error)