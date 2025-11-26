import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import formidable from 'formidable';
import xlsx from 'xlsx';
import fs from 'fs';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const config = {
  api: {
    bodyParser: false,
  },
};

// Verify auth token
function verifyToken(token: string): boolean {
  try {
    const SECRET_KEY = process.env.SECRET_KEY || 'mega-feira-secret-key-2025';
    const now = Date.now();

    // Check last 24 hours of possible tokens
    for (let i = 0; i < 24; i++) {
      const timestamp = Math.floor((now - (i * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const data = `${timestamp}-${SECRET_KEY}`;
      const validToken = crypto.createHash('sha256').update(data).digest('hex');
      if (token === validToken) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

// API to import stands from Excel
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  try {
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
    });

    const [fields, files] = await form.parse(req);

    const file = files.file?.[0];
    if (!file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado' });
      return;
    }

    // Read Excel file
    const workbook = xlsx.readFile(file.filepath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data: any[] = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      res.status(400).json({ error: 'Arquivo Excel vazio' });
      return;
    }

    console.log('📊 Imported data:', data);

    const results = {
      created: 0,
      updated: 0,
      errors: [] as any[],
      total: data.length
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        // Get stand name and limit from Excel columns
        // Support multiple column name variations
        const standName = row['Nome do Stand'] || row['Nome do Estande'] || row['Nome'] || row['Stand'] || row['Estande'] || row['name'] || row['Name'];
        const maxRegistrations = parseInt(row['Número de Credenciais'] || row['Credenciais'] || row['Limite'] || row['limit'] || row['Limit'] || '3');
        const eventCode = row['Código do Evento'] || row['Evento'] || row['Event'] || 'MEGA-FEIRA-2025';
        const location = row['Localização'] || row['Local'] || row['Location'] || '';
        const description = row['Descrição'] || row['Description'] || '';

        if (!standName) {
          results.errors.push({
            row: i + 2, // Excel row number (starts at 2 because of header)
            error: 'Nome do stand não fornecido'
          });
          continue;
        }

        // Generate stand code from name
        const standCode = standName
          .toUpperCase()
          .replace(/\s+/g, '_')
          .replace(/[^A-Z0-9_]/g, '');

        // Check if stand already exists
        const existingStand = await prisma.stand.findUnique({
          where: { code: standCode },
          include: {
            _count: {
              select: { participants: true }
            }
          }
        });

        if (existingStand) {
          // Update existing stand
          // Only update if new limit is >= current participant count
          if (maxRegistrations >= existingStand._count.participants) {
            await prisma.stand.update({
              where: { code: standCode },
              data: {
                name: standName,
                maxRegistrations: maxRegistrations,
                eventCode: eventCode || null,
                location: location || null,
                description: description || null,
                isActive: true
              }
            });
            results.updated++;
          } else {
            results.errors.push({
              row: i + 2,
              standName,
              error: `Não é possível reduzir o limite para ${maxRegistrations} pois já existem ${existingStand._count.participants} participantes cadastrados`
            });
          }
        } else {
          // Create new stand
          await prisma.stand.create({
            data: {
              name: standName,
              code: standCode,
              description: description || `Importado via Excel`,
              maxRegistrations: maxRegistrations,
              eventCode: eventCode || null,
              location: location || null,
              isActive: true
            }
          });
          results.created++;
        }
      } catch (rowError: any) {
        console.error(`Error processing row ${i + 2}:`, rowError);
        results.errors.push({
          row: i + 2,
          error: rowError.message
        });
      }
    }

    // Clean up uploaded file
    try {
      fs.unlinkSync(file.filepath);
    } catch (cleanupError) {
      console.error('Error cleaning up file:', cleanupError);
    }

    res.status(200).json({
      success: true,
      message: `Importação concluída: ${results.created} criados, ${results.updated} atualizados`,
      results
    });

  } catch (error: any) {
    console.error('Import error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}
