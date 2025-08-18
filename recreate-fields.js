// Recreate essential fields
async function recreateFields() {
  // Login
  const loginResponse = await fetch('http://localhost:3001/api/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'megafeira2025', action: 'login' })
  })
  
  const { token } = await loginResponse.json()
  console.log('Logged in successfully')
  
  // Create evento field (most important for the error)
  const eventoField = {
    fieldName: 'evento',
    label: 'Evento',
    type: 'select',
    required: true,
    placeholder: 'Selecione o evento',
    options: ['MEGA-FEIRA-2025', 'Expointer', 'Freio de Ouro', 'Morfologia', 'Leilão'],
    order: 5,
    active: true
  }
  
  console.log('Creating evento field...')
  const eventoResponse = await fetch('http://localhost:3001/api/admin/fields', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(eventoField)
  })
  
  if (eventoResponse.ok) {
    console.log('✅ Evento field created successfully')
  } else {
    const error = await eventoResponse.json()
    console.log('❌ Error creating evento field:', error)
  }
  
  // Check if other useful fields need to be created
  const fieldsToCreate = [
    {
      fieldName: 'empresa',
      label: 'Empresa',
      type: 'text',
      required: false,
      placeholder: 'Nome da empresa',
      order: 10,
      active: true
    },
    {
      fieldName: 'cargo',
      label: 'Cargo',
      type: 'text',
      required: false,
      placeholder: 'Seu cargo na empresa',
      order: 11,
      active: true
    }
  ]
  
  for (const field of fieldsToCreate) {
    console.log(`Creating ${field.label} field...`)
    const response = await fetch('http://localhost:3001/api/admin/fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(field)
    })
    
    if (response.ok) {
      console.log(`✅ ${field.label} field created`)
    } else {
      const error = await response.json()
      if (error.error === 'Field name already exists') {
        console.log(`ℹ️ ${field.label} field already exists`)
      } else {
        console.log(`❌ Error creating ${field.label}:`, error)
      }
    }
  }
  
  // List all fields to confirm
  console.log('\n📋 Current fields:')
  const listResponse = await fetch('http://localhost:3001/api/admin/fields', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  
  const data = await listResponse.json()
  data.fields.forEach(f => {
    console.log(`- ${f.label} (${f.fieldName}) - Type: ${f.type}`)
  })
}

recreateFields().catch(console.error)