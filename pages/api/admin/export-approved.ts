import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin authentication
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const format = req.query.format as string || 'json';

  try {
    // Get all approved participants
    const participants = await prisma.participant.findMany({
      where: {
        approvalStatus: 'approved'
      },
      orderBy: {
        approvedAt: 'desc'
      }
    });

    // Format data for HikCentral import
    const exportData = participants.map(p => ({
      'Person Code': p.cpf.replace(/\D/g, ''),
      'Person Name': p.name,
      'Gender': 'Unknown',
      'Employee No': p.cpf.replace(/\D/g, '').substring(0, 8),
      'Card No': '',
      'Department': 'Mega Feira 2025',
      'Phone': p.phone,
      'Email': p.email,
      'ID Type': 'CPF',
      'ID Number': p.cpf,
      'Valid From': new Date().toISOString().split('T')[0],
      'Valid To': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      'Access Level': 'Visitor',
      'User Type': 'Visitor',
      'Approved Date': p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('pt-BR') : '',
      'Sync Status': p.hikCentralSyncStatus || 'pending'
    }));

    if (format === 'xlsx' || format === 'excel') {
      // Create Excel file
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Approved Participants');
      
      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="mega-feira-approved-${new Date().toISOString().split('T')[0]}.xlsx"`);
      
      return res.send(buffer);
      
    } else if (format === 'csv') {
      // Create CSV
      const ws = XLSX.utils.json_to_sheet(exportData);
      const csv = XLSX.utils.sheet_to_csv(ws);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="mega-feira-approved-${new Date().toISOString().split('T')[0]}.csv"`);
      
      return res.send(csv);
      
    } else {
      // Return JSON
      return res.status(200).json({
        success: true,
        total: exportData.length,
        exportDate: new Date().toISOString(),
        data: exportData,
        instructions: {
          hikcentral: [
            '1. Abra o HikCentral Professional',
            '2. Vá para Access Control > Person',
            '3. Clique em Import',
            '4. Selecione o arquivo exportado',
            '5. Mapeie os campos corretamente',
            '6. Clique em Import para finalizar'
          ],
          formats: [
            'JSON: ?format=json (padrão)',
            'Excel: ?format=xlsx',
            'CSV: ?format=csv'
          ]
        }
      });
    }

  } catch (error: any) {
    console.error('Error exporting participants:', error);
    return res.status(500).json({ 
      error: 'Failed to export participants',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}