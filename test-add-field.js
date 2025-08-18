// Test script to add a custom field
fetch('http://localhost:3001/api/admin/fields', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fieldName: 'empresa',
    label: 'Empresa',
    type: 'text',
    required: false,
    placeholder: 'Nome da empresa',
    order: 10,
    active: true
  })
})
.then(res => res.json())
.then(data => console.log('Field created:', data))
.catch(err => console.error('Error:', err));

fetch('http://localhost:3001/api/admin/fields', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fieldName: 'cargo',
    label: 'Cargo',
    type: 'text',
    required: false,
    placeholder: 'Seu cargo na empresa',
    order: 11,
    active: true
  })
})
.then(res => res.json())
.then(data => console.log('Field created:', data))
.catch(err => console.error('Error:', err));

fetch('http://localhost:3001/api/admin/fields', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fieldName: 'evento',
    label: 'Evento de Interesse',
    type: 'select',
    required: true,
    placeholder: 'Selecione o evento',
    options: ['Expointer', 'Freio de Ouro', 'Morfologia', 'Leilão'],
    order: 5,
    active: true
  })
})
.then(res => res.json())
.then(data => console.log('Field created:', data))
.catch(err => console.error('Error:', err));

fetch('http://localhost:3001/api/admin/fields', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fieldName: 'mesa',
    label: 'Mesa',
    type: 'select',
    required: true,
    placeholder: 'Selecione a mesa',
    options: Array.from({ length: 83 }, (_, i) => `Mesa ${(i + 1).toString().padStart(2, '0')}`),
    order: 6,
    active: true
  })
})
.then(res => res.json())
.then(data => console.log('Field created:', data))
.catch(err => console.error('Error:', err));

console.log('Adding test fields...');