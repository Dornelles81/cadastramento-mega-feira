const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Create a new workbook
const workbook = XLSX.utils.book_new();

// Define the data with proper column structure
const data = [
  // Header row
  ['Nome do Estande', 'Número de Credenciais', 'Código do Evento', 'Localização', 'Descrição'],
  // Example rows
  ['Estande Samsung', 5, 'MEGA-FEIRA-2025', 'Pavilhão A - Setor 1', 'Estande da Samsung Electronics'],
  ['Estande Apple', 3, 'MEGA-FEIRA-2025', 'Pavilhão A - Setor 2', 'Estande da Apple Inc'],
  ['Estande Microsoft', 10, 'MEGA-FEIRA-2025', 'Pavilhão B - Setor 1', 'Estande da Microsoft Corporation'],
  ['Estande Google', 7, 'MEGA-FEIRA-2025', 'Pavilhão B - Setor 2', 'Estande do Google'],
  ['Estande Amazon', 15, 'MEGA-FEIRA-2025', 'Pavilhão C - Setor 1', 'Estande da Amazon Web Services'],
];

// Create worksheet from data
const worksheet = XLSX.utils.aoa_to_sheet(data);

// Set column widths
worksheet['!cols'] = [
  { wch: 25 }, // Nome do Estande
  { wch: 22 }, // Número de Credenciais
  { wch: 20 }, // Código do Evento
  { wch: 25 }, // Localização
  { wch: 40 }, // Descrição
];

// Style the header row (bold)
const headerStyle = {
  font: { bold: true, sz: 12 },
  fill: { fgColor: { rgb: "4472C4" } },
  alignment: { horizontal: "center", vertical: "center" }
};

// Apply styles to header cells
['A1', 'B1', 'C1', 'D1', 'E1'].forEach(cell => {
  if (worksheet[cell]) {
    worksheet[cell].s = headerStyle;
  }
});

// Add the worksheet to the workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Estandes');

// Write to file
const outputPath = path.join(__dirname, '..', 'public', 'modelo-importacao-estandes.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log('✅ Arquivo Excel criado com sucesso!');
console.log('📁 Local:', outputPath);
