import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { UserModel } from './modules/auth/auth.model';
import { UnitModel } from './modules/units/unit.model';

async function run() {
  console.log('Verificando integridade de usuários e unidades...');
  try {
    await connectDb();
    
    // 1. Buscar todos os caixas e funcionários sem unidade
    const usersWithoutUnit = await UserModel.find({
      role: { $in: ['cashier', 'employee', 'franchisee'] },
      unitId: { $exists: false }
    });

    console.log(`Encontrados ${usersWithoutUnit.length} usuários de nível de unidade sem unitId.`);

    if (usersWithoutUnit.length > 0) {
      // Tenta pegar a primeira unidade ativa para vincular (como fallback)
      const defaultUnit = await UnitModel.findOne({ isActive: true });
      if (defaultUnit) {
        for (const user of usersWithoutUnit) {
          user.unitId = defaultUnit._id as any;
          await user.save();
          console.log(`Usuário ${user.name} (${user.role}) vinculado à unidade: ${defaultUnit.name}`);
        }
      } else {
        console.log('Nenhuma unidade encontrada para vinculação.');
      }
    }

    // 2. Verificar se o caixa específico do teste existe e qual sua unidade
    const allCashiers = await UserModel.find({ role: 'cashier' });
    allCashiers.forEach(c => {
      console.log(`Caixa: ${c.name} | Email: ${c.email} | Unidade: ${c.unitId || 'NENHUMA'}`);
    });

    console.log('Verificação concluída.');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a verificação:', error);
    process.exit(1);
  }
}

run();
