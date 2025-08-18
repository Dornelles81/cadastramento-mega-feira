export function isValidCPF(cpf: string): boolean {
  // Remove non-numeric characters
  const numbers = cpf.replace(/\D/g, '')
  
  // Check if has 11 digits
  if (numbers.length !== 11) return false
  
  // Check if all digits are the same
  if (/^(\d)\1{10}$/.test(numbers)) return false

  // Validate first check digit
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(numbers[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(numbers[9])) return false

  // Validate second check digit
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(numbers[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  
  return remainder === parseInt(numbers[10])
}

export function formatCPF(cpf: string): string {
  const numbers = cpf.replace(/\D/g, '')
  if (numbers.length !== 11) return cpf
  
  return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}