import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { UserModel } from './modules/auth/auth.model';

async function run() {
  console.log('Iniciando manutenção profunda de índices...');
  try {
    await connectDb();
    
    const collection = mongoose.connection.collection('users');

    console.log('Removendo índices antigos...');
    try {
      await collection.dropIndex('email_1');
      console.log('Índice de email removido.');
    } catch (e) {
      console.log('Índice de email não encontrado ou já removido.');
    }

    try {
      await collection.dropIndex('phone_1');
      console.log('Índice de telefone removido.');
    } catch (e) {
      console.log('Índice de telefone não encontrado ou já removido.');
    }

    console.log('Sincronizando novos índices esparsos...');
    await UserModel.createIndexes();
    
    console.log('Limpeza de campos residuais...');
    await UserModel.updateMany(
      { $or: [{ email: "" }, { email: null }] },
      { $unset: { email: "" } }
    );
    await UserModel.updateMany(
      { $or: [{ phone: "" }, { phone: null }] },
      { $unset: { phone: "" } }
    );

    console.log('Manutenção concluída com sucesso. Os índices foram recriados corretamente.');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a manutenção:', error);
    process.exit(1);
  }
}

run();
