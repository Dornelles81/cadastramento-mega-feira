import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Imagem de teste em base64 (1x1 pixel JPEG vermelho)
const TEST_IMAGE_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader || authHeader !== `Bearer ${validPassword}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Buscar participantes aprovados sem foto real
    const participants = await prisma.participant.findMany({
      where: {
        approvalStatus: 'approved',
        OR: [
          { faceImageUrl: { startsWith: 'https://example.com' } },
          { faceImageUrl: null }
        ]
      }
    });

    let updatedCount = 0;

    // Adicionar imagem base64 de teste para cada participante
    for (const participant of participants) {
      // Gerar uma imagem ligeiramente diferente para cada pessoa (variando a cor)
      const colors = ['FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF'];
      const colorIndex = updatedCount % colors.length;
      
      // Para simplificar, usamos a mesma imagem base64 para todos
      // Em produção, cada pessoa teria sua foto real
      const faceImageDataUrl = `data:image/jpeg;base64,${TEST_IMAGE_BASE64}`;
      
      // Converter base64 para Buffer para salvar no banco
      const imageBuffer = Buffer.from(TEST_IMAGE_BASE64, 'base64');
      
      await prisma.participant.update({
        where: { id: participant.id },
        data: {
          faceData: imageBuffer,
          faceImageUrl: null // Limpar URL antiga
        }
      });
      
      updatedCount++;
    }

    return res.status(200).json({
      success: true,
      message: `${updatedCount} participantes atualizados com fotos de teste`,
      updated: updatedCount
    });

  } catch (error: any) {
    console.error('Error adding test photos:', error);
    return res.status(500).json({ 
      error: 'Failed to add test photos',
      details: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}