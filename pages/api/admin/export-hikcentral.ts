import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin authentication
  // Allow access if coming from admin panel (check referer) or has valid auth header
  const referer = req.headers.referer || '';
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  // Check if request is coming from admin pages
  const isFromAdmin = referer.includes('/admin');
  
  // Allow if from admin or has valid auth header
  if (!isFromAdmin && (!authHeader || authHeader !== `Bearer ${validPassword}`)) {
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
      
      // Criar workbook
      const wb = XLSX.utils.book_new();
      
      // Criar worksheet com as instruções/regras nas primeiras linhas
      const rulesData = [
        ['Rule'],
        ['Either first name or last name is required.'],
        ['Once configured, the ID cannot be edited. Confirm the ID rule before setting an ID.'],
        ['Do NOT change the layout or column heading in this template file. Otherwise, importing may fail.'],
        ['You can add persons to existing departments. The department name should be separated by /. For example, to import persons to Department A under All Departments, please enter All Departments/Department A.'],
        ['Start Time of Effective Period is used for Access Control Module and Time & Attendance Module. Format: yyyy/mm/dd hh:mm:ss.'],
        ['End Time of Effective Period is used for Access Control Module and Time & Attendance Module. Format: yyyy/mm/dd hh:mm:ss.']
      ];
      
      // Adicionar cabeçalhos na linha 8 (index 7)
      // IMPORTANTE: Usar os nomes exatos esperados pelo HikCentral
      const headers = [
        'Employee No.',  // Campo obrigatório - ID único
        'Name',          // Nome completo
        'Gender',        // M/F
        'Organization',  // Departamento/Organização
        'Phone',         // Telefone
        'Email',         // Email
        'Valid Begin Time',  // Data de início
        'Valid End Time'     // Data de fim
      ];
      
      // Preparar dados dos participantes aprovados
      const participantData = participants.map(p => {
        // Formatar datas no padrão yyyy/mm/dd hh:mm:ss
        const startDate = new Date();
        const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 dias
        
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hour = String(date.getHours()).padStart(2, '0');
          const minute = String(date.getMinutes()).padStart(2, '0');
          const second = String(date.getSeconds()).padStart(2, '0');
          return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
        };
        
        // Tentar detectar gênero pelo nome (básico)
        const gender = 'M'; // Padrão masculino, pode ser melhorado
        
        // Formatar telefone removendo caracteres especiais
        const phoneClean = p.phone ? p.phone.replace(/\D/g, '') : '';
        
        return [
          p.cpf.replace(/\D/g, ''),  // Employee No. (CPF sem formatação)
          p.name,                     // Name (nome completo)
          gender,                     // Gender (M/F)
          'MEGA-FEIRA-2025',         // Organization
          phoneClean,                 // Phone (sem formatação)
          p.email || '',             // Email
          formatDate(startDate),      // Valid Begin Time
          formatDate(endDate)         // Valid End Time
        ];
      });
      
      // Combinar todas as linhas
      const allData = [
        ...rulesData,
        headers,
        ...participantData
      ];
      
      // Criar worksheet a partir dos dados
      const ws = XLSX.utils.aoa_to_sheet(allData);
      
      // Definir largura das colunas para melhor visualização
      const colWidths = [
        { wch: 20 }, // Employee No.
        { wch: 35 }, // Name
        { wch: 10 }, // Gender
        { wch: 25 }, // Organization
        { wch: 20 }, // Phone
        { wch: 35 }, // Email
        { wch: 25 }, // Valid Begin Time
        { wch: 25 }  // Valid End Time
      ];
      ws['!cols'] = colWidths;
      
      // Adicionar a planilha ao workbook com o nome correto
      XLSX.utils.book_append_sheet(wb, ws, 'Person Information Template');
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="hikcentral-import-${new Date().toISOString().split('T')[0]}.xlsx"`);
      
      return res.send(buffer);
      
    } else if (format === 'csv') {
      // Formato CSV para importação
      const csvData = participants.map(p => ({
        employeeNo: p.cpf.replace(/\D/g, ''),
        name: p.name,
        gender: 'unknown',
        department: 'Mega Feira 2025',
        phone: p.phone || '',
        email: p.email || '',
        cardNo: '',
        validBegin: new Date().toISOString().split('T')[0],
        validEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        accessGroup: '1',
        userType: 'normal',
        facePhotoName: p.cpf.replace(/\D/g, '') + '.jpg'
      }));

      const ws = XLSX.utils.json_to_sheet(csvData);
      const csv = XLSX.utils.sheet_to_csv(ws);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="hikcentral-import-${new Date().toISOString().split('T')[0]}.csv"`);
      
      return res.send(csv);
      
    } else if (format === 'photos') {
      // Gerar ZIP com as fotos
      const zip = new JSZip();
      // NÃO criar pasta - colocar fotos na raiz do ZIP
      
      for (const participant of participants) {
        if (participant.faceImageUrl || participant.faceData) {
          let imageData = '';
          // IMPORTANTE: Nome do arquivo deve corresponder ao Employee No.
          // Formato: CPF_sem_formatacao.jpg
          const employeeNo = participant.cpf.replace(/\D/g, '');
          const fileName = `${employeeNo}.jpg`;
          
          if (participant.faceData) {
            // Converter Buffer para base64
            imageData = Buffer.from(participant.faceData).toString('base64');
          } else if (participant.faceImageUrl) {
            if (participant.faceImageUrl.startsWith('data:image')) {
              // Extrair apenas a parte base64, removendo o header data:image/jpeg;base64,
              const base64Part = participant.faceImageUrl.split(',')[1];
              if (base64Part) {
                imageData = base64Part;
              }
            }
          }
          
          if (imageData && imageData.length > 0) {
            // Adicionar arquivo diretamente na raiz do ZIP
            // Garantir que o nome não tem caracteres especiais além de + e _
            const safeFileName = fileName.replace(/[^\w\+_\-\.]/g, '');
            zip.file(safeFileName, imageData, { base64: true });
          }
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
  } finally {
    await prisma.$disconnect();
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb'
    }
  }
};