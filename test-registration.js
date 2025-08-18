// Test registration API
const testData = {
  name: "Test User",
  cpf: "111.444.777-35", // Valid CPF for testing
  email: "test@example.com",
  phone: "(11) 98765-4321",
  eventCode: "MEGA-FEIRA-2025",
  faceImage: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", // Mock image
  consent: true,
  customData: {}
};

fetch('http://localhost:3004/api/register-fixed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testData)
})
.then(response => response.json())
.then(data => {
  console.log('Response:', data);
})
.catch(error => {
  console.error('Error:', error);
});