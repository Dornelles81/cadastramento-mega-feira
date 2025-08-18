// Test authenticated field creation

// First, login to get token
async function testFieldCreation() {
  console.log('1. Logging in...')
  
  // Login
  const loginResponse = await fetch('http://localhost:3001/api/admin/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: 'megafeira2025',
      action: 'login'
    })
  })
  
  const loginData = await loginResponse.json()
  console.log('Login response:', loginData)
  
  if (!loginData.token) {
    console.error('Failed to get token!')
    return
  }
  
  const token = loginData.token
  console.log('2. Got token:', token)
  
  // Create field with auth
  console.log('3. Creating field with authentication...')
  const fieldResponse = await fetch('http://localhost:3001/api/admin/fields', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      fieldName: 'observacoes',
      label: 'Observações',
      type: 'textarea',
      required: false,
      placeholder: 'Digite suas observações aqui',
      order: 20,
      active: true
    })
  })
  
  const fieldData = await fieldResponse.json()
  console.log('Field creation response:', fieldResponse.status, fieldData)
  
  // List fields to verify
  console.log('4. Listing fields to verify...')
  const listResponse = await fetch('http://localhost:3001/api/admin/fields', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  
  const listData = await listResponse.json()
  console.log('Total fields:', listData.fields?.length)
  console.log('Fields:', listData.fields?.map(f => f.label))
}

testFieldCreation().catch(console.error)