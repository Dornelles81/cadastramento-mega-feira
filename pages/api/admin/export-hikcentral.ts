import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin authentication
  // Allow access if coming from admin panel (check referer) or has valid auth header
  const referer = req.headers.referer || '';
  const host = req.headers.host || '';
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // Check if request is coming from admin pages or localhost
  const isFromAdmin = referer.includes('/admin');
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  // Allow if from admin, localhost, or has valid auth header
  if (!isFromAdmin && !isLocalhost && (!authHeader || authHeader !== `Bearer ${validPassword}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const format = req.query.format as string || 'excel';

  try {
    // Get all approved participants
    const participants = await prisma.participant.findMany({
      where: {
        approvalStatus: 'approved'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (format === 'excel') {
      // Formato Excel para importação no HikCentral - Template Oficial
      // Baseado no template: Person Information Template_2025_08_27_10_28_22.xlsx
      
      // Criar workbook e worksheet diretamente com json_to_sheet
      const wb = XLSX.utils.book_new();

      // Preparar dados dos participantes aprovados como objetos
      const participantData = participants.map(p => {
        // Formatar datas no padrão yyyy/mm/dd hh:mm:ss
        const startDate = new Date();
        const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 dias

        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}/${month}/${day}`;
        };

        // Dividir nome em First Name e Last Name
        const nameParts = p.name.trim().split(' ');
        const firstName = nameParts[0] || p.name;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        // Formatar telefone removendo caracteres especiais
        const phoneClean = p.phone ? p.phone.replace(/\D/g, '') : '';

        return {
          'Employee No.': p.cpf.replace(/\D/g, ''),
          'First Name': firstName,
          'Last Name': lastName,
          'Gender': 'Male',
          'Phone': phoneClean,
          'Email': p.email || '',
          'Organization': 'MEGA-FEIRA-2025',
          'Valid Begin Time': formatDate(startDate),
          'Valid End Time': formatDate(endDate)
        };
      });
      
      // Criar worksheet a partir dos objetos JSON
      const ws = XLSX.utils.json_to_sheet(participantData);

      // Definir largura das colunas para melhor visualização
      const colWidths = [
        { wch: 20 }, // Employee No.
        { wch: 20 }, // First Name
        { wch: 25 }, // Last Name
        { wch: 15 }, // Gender
        { wch: 20 }, // Phone
        { wch: 35 }, // Email
        { wch: 25 }, // Organization
        { wch: 20 }, // Valid Begin Time
        { wch: 20 }  // Valid End Time
      ];
      ws['!cols'] = colWidths;

      // Adicionar a planilha ao workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="hikcentral-import-${new Date().toISOString().split('T')[0]}.xlsx"`);
      
      return res.send(buffer);
      
    } else if (format === 'csv') {
      // Formato CSV: CPF como First Name, Nome como Last Name
      const csvLines = ['ID,First Name (CPF),Last Name (Nome)'];

      participants.forEach(p => {
        const cpfClean = p.cpf.replace(/\D/g, '');
        const nameClean = p.name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
        csvLines.push(`${cpfClean},${cpfClean},${nameClean}`);
      });

      const csv = csvLines.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hikcentral-dados-${new Date().toISOString().split('T')[0]}.csv"`);

      return res.send('\ufeff' + csv); // BOM para UTF-8
      
    } else if (format === 'photos') {
      // Gerar ZIP com as fotos
      const zip = new JSZip();
      // NÃO criar pasta - colocar fotos na raiz do ZIP
      
      for (const participant of participants) {
        if (!participant.faceImageUrl) {
          console.log(`Skipping ${participant.name} - No face image`);
          continue;
        }

        // FORMATO: CPF_Nome.jpg
        // CPF será usado como First Name e Nome como Last Name
        const cpfClean = participant.cpf.replace(/\D/g, '');
        const nameClean = participant.name
          .replace(/[^a-zA-Z0-9\s]/g, '') // Remove caracteres especiais
          .replace(/\s+/g, '_')           // Substitui espaços por underscore
          .substring(0, 30);              // Limita a 30 caracteres

        const fileName = `${cpfClean}_${nameClean}.jpg`;

        let imageData = '';

        // PRIORIZAR faceImageUrl que contém a imagem real
        if (participant.faceImageUrl && participant.faceImageUrl.startsWith('data:image')) {
          // Extrair apenas a parte base64, removendo o header data:image/jpeg;base64,
          const base64Part = participant.faceImageUrl.split(',')[1];
          if (base64Part && base64Part.length > 100) {
            imageData = base64Part;
          }
        }

        if (imageData && imageData.length > 100) {
          // Adicionar arquivo diretamente na raiz do ZIP
          zip.file(fileName, imageData, { base64: true });
          console.log(`Added photo: ${fileName} (${imageData.length} chars)`);
        } else {
          console.log(`Skipping ${participant.name} - Invalid or missing image data`);
        }
      }
      
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="hikcentral-photos-${new Date().toISOString().split('T')[0]}.zip"`);
      
      return res.send(zipBuffer);
      
    } else {
      // Retornar JSON com instruções detalhadas
      return res.status(200).json({
        success: true,
        total: participants.length,
        exportDate: new Date().toISOString(),
        instructions: {
          step1: {
            title: 'Baixar os arquivos',
            actions: [
              'GET /api/admin/export-hikcentral?format=excel - Arquivo Excel com dados',
              'GET /api/admin/export-hikcentral?format=photos - ZIP com fotos'
            ]
          },
          step2: {
            title: 'Acessar HikCentral',
            url: 'http://127.0.0.1',
            navigation: [
              'Login como admin',
              'Access Control > Person',
              'Ou: Person > Person Management'
            ]
          },
          step3: {
            title: 'Importar dados',
            actions: [
              'Clique em Import ou Batch Import',
              'Selecione o arquivo Excel',
              'Mapeie as colunas:',
              '  - Employee No → Person ID',
              '  - Name → Person Name',
              '  - Face Photo Name → Photo Reference',
              'Faça upload do ZIP com fotos',
              'Clique em Import'
            ]
          },
          step4: {
            title: 'Verificar importação',
            actions: [
              'Verifique o log de importação',
              'Confirme que as fotos foram associadas',
              'Teste o reconhecimento facial'
            ]
          }
        },
        participants: participants.map(p => ({
          id: p.id,
          name: p.name,
          cpf: p.cpf,
          hasPhoto: !!(p.faceImageUrl || p.faceData),
          status: p.hikCentralSyncStatus
        }))
      });
    }

  } catch (error: any) {
    console.error('Export error:', error);
    return res.status(500).json({
      error: 'Failed to export data',
      details: error.message
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb'
    }
  }
};