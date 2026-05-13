import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { UserModel } from './modules/auth/auth.model';

async function run() {
  console.log('Migrando caixas para a unidade correta...');
  try {
    await connectDb();
    
    // Altera a unidade de todos os caixas para ...50
    const targetUnit = '69fa463aa078044937f70250';
    
    const result = await UserModel.updateMany(
      { role: 'cashier' },
      { $set: { unitId: new mongoose.Types.ObjectId(targetUnit) } }
    );

    console.log(`Sucesso: ${result.modifiedCount} usuários de Caixa foram movidos para a unidade ${targetUnit}.`);
    
    console.log('Migração concluída.');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a migração:', error);
    process.exit(1);
  }
}

run();
