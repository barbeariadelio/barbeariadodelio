import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barber-delio';

// ─── Schemas ───────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
  name: String, email: String, passwordHash: String, passwordPlain: String,
  role: { type: String, enum: ['owner', 'employee', 'franchisor', 'franchisee', 'client'] },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  phone: String, avatar: String,
  workSchedule: {
    start: { type: String, default: '08:00' },
    end:   { type: String, default: '18:00' },
    lunchStart: String,
    lunchEnd:   String,
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const FranchiseSchema = new mongoose.Schema({
  name: String,
  franchisors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  royaltyPercent: Number,
  units: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Unit' }],
}, { timestamps: true });

const UnitSchema = new mongoose.Schema({
  name: String, address: String, phone: String, cnpj: String, apiUrl: String,
  ownerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const ServiceSchema = new mongoose.Schema({
  name: String, description: String, price: Number, durationMinutes: Number,
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const ClientSchema = new mongoose.Schema({
  name: String, email: String, phone: String,
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unitId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  birthdate: String, notes: String,
}, { timestamps: true });

const ProductSchema = new mongoose.Schema({
  name: String, description: String,
  price: Number, costPrice: Number,
  stockQuantity: { type: Number, default: 0 },
  minStock:      { type: Number, default: 5 },
  unitId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  category:  String,
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

const AppointmentSchema = new mongoose.Schema({
  clientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  serviceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  unitId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  date: String, startTime: String, endTime: String,
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'confirmed' },
  notes: String, price: Number,
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  unitId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  type:     { type: String, enum: ['income', 'expense', 'royalty'] },
  category: { type: String, enum: ['service', 'product', 'salary', 'rent', 'other'] },
  amount: Number, description: String, date: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const TaskSchema = new mongoose.Schema({
  title: String, description: String,
  status:   { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  dueDate: String,
  system: { type: String, enum: ['admin', 'franchise'], required: true },
}, { timestamps: true });

const UserModel        = mongoose.model('User',        UserSchema);
const FranchiseModel   = mongoose.model('Franchise',   FranchiseSchema);
const UnitModel        = mongoose.model('Unit',        UnitSchema);
const ServiceModel     = mongoose.model('Service',     ServiceSchema);
const ClientModel      = mongoose.model('Client',      ClientSchema);
const ProductModel     = mongoose.model('Product',     ProductSchema);
const AppointmentModel = mongoose.model('Appointment', AppointmentSchema);
const TransactionModel = mongoose.model('Transaction', TransactionSchema);
const TaskModel        = mongoose.model('Task',        TaskSchema);

// ─── Helpers ───────────────────────────────────────────────────────────────

function d(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

function addMin(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ─── Seed ──────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('\n🔌 MongoDB conectado');

  const isReset = process.argv.includes('--reset');

  // Se --reset, apaga apenas os dados de exemplo (não toca em dados reais do usuário)
  if (isReset) {
    const seedFranchise = await FranchiseModel.findOne({ name: 'Rede Délio Barbearias' });
    if (seedFranchise) {
      const seedUnitIds = seedFranchise.units as mongoose.Types.ObjectId[];
      const seedUserEmails = [
        'delio@barbeariadelio.com.br', 'admin@barbeariadelio.com.br',
        'marcos@barbeariadelio.com.br', 'rafael@barbeariadelio.com.br',
        'thiago@barbeariadelio.com.br', 'bruno@barbeariadelio.com.br',
      ];
      await Promise.all([
        FranchiseModel.deleteOne({ _id: seedFranchise._id }),
        UnitModel.deleteMany({ _id: { $in: seedUnitIds } }),
        UserModel.deleteMany({ email: { $in: seedUserEmails } }),
        ServiceModel.deleteMany({ unitId: { $in: seedUnitIds } }),
        ClientModel.deleteMany({ unitId: { $in: seedUnitIds } }),
        ProductModel.deleteMany({ unitId: { $in: seedUnitIds } }),
        AppointmentModel.deleteMany({ unitId: { $in: seedUnitIds } }),
        TransactionModel.deleteMany({ unitId: { $in: seedUnitIds } }),
        TaskModel.deleteMany({ system: { $in: ['admin', 'franchise'] } }),
      ]);
      console.log('🗑️  Dados de exemplo removidos — reinserindo...\n');
    }
  } else {
    // Evita duplicar se o seed já foi rodado antes
    const alreadySeeded = await FranchiseModel.findOne({ name: 'Rede Délio Barbearias' });
    if (alreadySeeded) {
      console.log('⚠️  Dados de exemplo já existem no banco. Seed ignorado para não duplicar.');
      console.log('   Para reinserir do zero, use: npm run seed:reset\n');
      await mongoose.disconnect();
      return;
    }
  }

  const hash = (pwd: string) => bcrypt.hash(pwd, 10);

  // ── FRANQUIA ────────────────────────────────────────────────────────────
  const franchise = await FranchiseModel.create({
    name: 'Rede Délio Barbearias',
    franchisors: [],
    royaltyPercent: 8,
    units: [],
  });

  // ── UNIDADES ────────────────────────────────────────────────────────────
  const unitSol = await UnitModel.create({
    name: 'Barbearia Délio – Jd Morada do Sol',
    address: 'Rua Antônio Cantelli, 1270 – Jd Morada do Sol, Indaiatuba/SP',
    phone: '(19) 3321-4477',
    cnpj: '12.345.678/0001-90',
    apiUrl: 'http://localhost:3001',
    franchiseId: franchise._id,
    isActive: true,
  });

  const unitNV = await UnitModel.create({
    name: 'Barbearia Délio – Nova Veneza',
    address: 'Rua Arthur Godoy de Carvalho Sá, 164 – Res. Nova Veneza, Indaiatuba/SP',
    phone: '(19) 3322-5588',
    cnpj: '12.345.678/0002-71',
    apiUrl: 'http://localhost:3001',
    franchiseId: franchise._id,
    isActive: true,
  });

  // ── USUÁRIOS ────────────────────────────────────────────────────────────
  const upsertUser = async (email: string, data: object) =>
    UserModel.findOneAndUpdate({ email }, { $setOnInsert: data }, { upsert: true, new: true });

  const franchisor = await upsertUser('delio@barbeariadelio.com.br', {
    name: 'Délio Rodrigues',
    email: 'delio@barbeariadelio.com.br',
    passwordHash: await hash('admin123'), passwordPlain: 'admin123',
    role: 'franchisor',
    phone: '(19) 99821-4477',
    isActive: true,
  });

  const owner = await upsertUser('admin@barbeariadelio.com.br', {
    name: 'Carlos Gestor',
    email: 'admin@barbeariadelio.com.br',
    passwordHash: await hash('admin123'), passwordPlain: 'admin123',
    role: 'owner',
    phone: '(19) 99821-0000',
    unitId: unitSol._id,
    isActive: true,
  });

  // Employees – Jd Morada do Sol
  const marcos = await upsertUser('marcos@barbeariadelio.com.br', {
    name: 'Marcos Oliveira',
    email: 'marcos@barbeariadelio.com.br',
    passwordHash: await hash('marcos123'), passwordPlain: 'marcos123',
    role: 'employee', phone: '(19) 99234-5678',
    unitId: unitSol._id,
    workSchedule: { start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    isActive: true,
  });
  const rafaelEmp = await upsertUser('rafael@barbeariadelio.com.br', {
    name: 'Rafael Costa',
    email: 'rafael@barbeariadelio.com.br',
    passwordHash: await hash('rafael123'), passwordPlain: 'rafael123',
    role: 'employee', phone: '(19) 99876-5432',
    unitId: unitSol._id,
    workSchedule: { start: '09:00', end: '19:00', lunchStart: '13:00', lunchEnd: '14:00' },
    isActive: true,
  });

  // Employees – Nova Veneza
  const thiago = await upsertUser('thiago@barbeariadelio.com.br', {
    name: 'Thiago Almeida',
    email: 'thiago@barbeariadelio.com.br',
    passwordHash: await hash('thiago123'), passwordPlain: 'thiago123',
    role: 'employee', phone: '(19) 99333-1111',
    unitId: unitNV._id,
    workSchedule: { start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    isActive: true,
  });
  const brunoEmp = await upsertUser('bruno@barbeariadelio.com.br', {
    name: 'Bruno Souza',
    email: 'bruno@barbeariadelio.com.br',
    passwordHash: await hash('bruno123'), passwordPlain: 'bruno123',
    role: 'employee', phone: '(19) 99444-2222',
    unitId: unitNV._id,
    workSchedule: { start: '10:00', end: '20:00', lunchStart: '14:00', lunchEnd: '15:00' },
    isActive: true,
  });

  // Vincula owner, franqueador e unidades
  await UnitModel.findByIdAndUpdate(unitSol._id, { ownerId: owner._id });
  await UnitModel.findByIdAndUpdate(unitNV._id,  { ownerId: owner._id });
  await FranchiseModel.findByIdAndUpdate(franchise._id, {
    franchisors: [franchisor._id],
    units: [unitSol._id, unitNV._id],
  });

  console.log('👥 Usuários criados');

  // ── SERVIÇOS ────────────────────────────────────────────────────────────
  // Jd Morada do Sol
  const [svcCorte, svcBarba, svcCombo, svcHidra, svcPigm] = await ServiceModel.insertMany([
    { name: 'Corte Simples',       description: 'Corte masculino com tesoura ou máquina',    price: 35, durationMinutes: 30, unitId: unitSol._id, isActive: true },
    { name: 'Barba',               description: 'Modelagem com navalha e toalha quente',      price: 25, durationMinutes: 20, unitId: unitSol._id, isActive: true },
    { name: 'Corte + Barba',       description: 'Pacote completo: corte e barba',              price: 55, durationMinutes: 45, unitId: unitSol._id, isActive: true },
    { name: 'Hidratação Capilar',  description: 'Tratamento hidratante para cabelo e couro',  price: 40, durationMinutes: 40, unitId: unitSol._id, isActive: true },
    { name: 'Pigmentação',         description: 'Cobertura de fios brancos com pigmento',      price: 80, durationMinutes: 60, unitId: unitSol._id, isActive: true },
  ]);

  // Nova Veneza
  const [svcCorteNV, svcBarbaNV, svcComboNV] = await ServiceModel.insertMany([
    { name: 'Corte Simples',  description: 'Corte masculino com tesoura ou máquina',  price: 35, durationMinutes: 30, unitId: unitNV._id, isActive: true },
    { name: 'Barba',          description: 'Modelagem com navalha e toalha quente',   price: 25, durationMinutes: 20, unitId: unitNV._id, isActive: true },
    { name: 'Corte + Barba',  description: 'Pacote completo: corte e barba',           price: 55, durationMinutes: 45, unitId: unitNV._id, isActive: true },
  ]);

  console.log('✂️  Serviços criados');

  // ── CLIENTES ────────────────────────────────────────────────────────────
  const [cli1, cli2, cli3, cli4] = await ClientModel.insertMany([
    { name: 'João Silva',     email: 'joao.silva@email.com',    phone: '(19) 99111-2233', unitId: unitSol._id, birthdate: '1990-03-15', notes: 'Prefere corte degradê alto no 2' },
    { name: 'Pedro Costa',    email: 'pedro.costa@email.com',   phone: '(19) 99444-5566', unitId: unitSol._id, birthdate: '1985-08-22' },
    { name: 'Lucas Mendes',   email: 'lucas.mendes@email.com',  phone: '(19) 99777-8899', unitId: unitSol._id, birthdate: '1993-11-08', notes: 'Alérgico a alguns produtos — consultar antes' },
    { name: 'Carlos Ferreira',email: 'carlos.f@email.com',      phone: '(19) 99000-1122', unitId: unitSol._id, birthdate: '1988-06-30' },
  ]);
  const [cli5, cli6, cli7] = await ClientModel.insertMany([
    { name: 'Anderson Lima',  email: 'anderson@email.com',      phone: '(19) 98555-6677', unitId: unitNV._id,  birthdate: '1995-02-14' },
    { name: 'Rodrigo Nunes',  email: 'rodrigo.n@email.com',     phone: '(19) 98888-9900', unitId: unitNV._id,  birthdate: '1991-09-05' },
    { name: 'Felipe Martins', email: 'felipe.m@email.com',      phone: '(19) 97777-3344', unitId: unitNV._id,  birthdate: '1987-12-20' },
  ]);

  console.log('👤 Clientes criados');

  // ── PRODUTOS ────────────────────────────────────────────────────────────
  await ProductModel.insertMany([
    // Jd Morada do Sol
    { name: 'Pomada Modeladora Matte',   description: 'Fixação forte, acabamento fosco',       price: 38, costPrice: 15, stockQuantity: 22, minStock: 5, unitId: unitSol._id, category: 'Pomadas',  isActive: true },
    { name: 'Óleo de Barba Premium',     description: 'Hidrata e amacia os pelos da barba',    price: 52, costPrice: 20, stockQuantity: 14, minStock: 5, unitId: unitSol._id, category: 'Barba',    isActive: true },
    { name: 'Shampoo Anticaspa',         description: 'Para cabelos com caspa e oleosidade',   price: 45, costPrice: 18, stockQuantity: 9,  minStock: 5, unitId: unitSol._id, category: 'Cabelo',   isActive: true },
    { name: 'Cera de Abelha',            description: 'Controle natural com brilho suave',     price: 42, costPrice: 16, stockQuantity: 3,  minStock: 5, unitId: unitSol._id, category: 'Pomadas',  isActive: true },
    { name: 'Pós-Barba Hidratante',      description: 'Acalma a pele após a barbeação',        price: 35, costPrice: 12, stockQuantity: 7,  minStock: 5, unitId: unitSol._id, category: 'Barba',    isActive: true },
    { name: 'Finalizador Capilar',       description: 'Sela as cutículas e dá brilho',         price: 60, costPrice: 24, stockQuantity: 11, minStock: 5, unitId: unitSol._id, category: 'Cabelo',   isActive: true },
    // Nova Veneza
    { name: 'Pomada Modeladora Matte',   description: 'Fixação forte, acabamento fosco',       price: 38, costPrice: 15, stockQuantity: 18, minStock: 5, unitId: unitNV._id,  category: 'Pomadas',  isActive: true },
    { name: 'Óleo de Barba Premium',     description: 'Hidrata e amacia os pelos da barba',    price: 52, costPrice: 20, stockQuantity: 4,  minStock: 5, unitId: unitNV._id,  category: 'Barba',    isActive: true },
    { name: 'Shampoo Anticaspa',         description: 'Para cabelos com caspa e oleosidade',   price: 45, costPrice: 18, stockQuantity: 6,  minStock: 5, unitId: unitNV._id,  category: 'Cabelo',   isActive: true },
  ]);

  console.log('📦 Produtos criados');

  // ── AGENDAMENTOS ────────────────────────────────────────────────────────
  // Jd Morada do Sol — passados (completed)
  const a1 = await AppointmentModel.create({ clientId: cli1._id, employeeId: marcos._id,   serviceId: svcCorte._id, unitId: unitSol._id, date: d(-8), startTime: '09:00', endTime: addMin('09:00', 30), status: 'completed', price: 35 });
  const a2 = await AppointmentModel.create({ clientId: cli2._id, employeeId: rafaelEmp._id, serviceId: svcBarba._id, unitId: unitSol._id, date: d(-7), startTime: '10:30', endTime: addMin('10:30', 20), status: 'completed', price: 25 });
  const a3 = await AppointmentModel.create({ clientId: cli3._id, employeeId: marcos._id,   serviceId: svcCombo._id, unitId: unitSol._id, date: d(-6), startTime: '14:00', endTime: addMin('14:00', 45), status: 'completed', price: 55 });
  const a4 = await AppointmentModel.create({ clientId: cli4._id, employeeId: rafaelEmp._id, serviceId: svcCorte._id, unitId: unitSol._id, date: d(-5), startTime: '16:00', endTime: addMin('16:00', 30), status: 'completed', price: 35 });
  const a5 = await AppointmentModel.create({ clientId: cli1._id, employeeId: marcos._id,   serviceId: svcPigm._id,  unitId: unitSol._id, date: d(-4), startTime: '09:00', endTime: addMin('09:00', 60), status: 'completed', price: 80 });
  const a6 = await AppointmentModel.create({ clientId: cli2._id, employeeId: rafaelEmp._id, serviceId: svcCombo._id, unitId: unitSol._id, date: d(-3), startTime: '11:00', endTime: addMin('11:00', 45), status: 'completed', price: 55 });
  const a7 = await AppointmentModel.create({ clientId: cli3._id, employeeId: marcos._id,   serviceId: svcHidra._id, unitId: unitSol._id, date: d(-2), startTime: '15:00', endTime: addMin('15:00', 40), status: 'completed', price: 40 });
  // Cancelado
  await AppointmentModel.create({ clientId: cli4._id, employeeId: rafaelEmp._id, serviceId: svcBarba._id, unitId: unitSol._id, date: d(-3), startTime: '17:00', endTime: addMin('17:00', 20), status: 'cancelled', price: 25, notes: 'Cliente não compareceu' });
  // Hoje
  await AppointmentModel.create({ clientId: cli1._id, employeeId: marcos._id,    serviceId: svcCorte._id, unitId: unitSol._id, date: d(0),  startTime: '09:00', endTime: addMin('09:00', 30), status: 'confirmed', price: 35 });
  await AppointmentModel.create({ clientId: cli2._id, employeeId: rafaelEmp._id, serviceId: svcCombo._id, unitId: unitSol._id, date: d(0),  startTime: '14:00', endTime: addMin('14:00', 45), status: 'confirmed', price: 55 });
  // Futuros
  await AppointmentModel.create({ clientId: cli3._id, employeeId: marcos._id,    serviceId: svcPigm._id,  unitId: unitSol._id, date: d(2),  startTime: '10:00', endTime: addMin('10:00', 60), status: 'confirmed', price: 80 });
  await AppointmentModel.create({ clientId: cli4._id, employeeId: rafaelEmp._id, serviceId: svcCombo._id, unitId: unitSol._id, date: d(4),  startTime: '15:00', endTime: addMin('15:00', 45), status: 'confirmed', price: 55 });

  // Nova Veneza
  const a8  = await AppointmentModel.create({ clientId: cli5._id, employeeId: thiago._id,   serviceId: svcCorteNV._id, unitId: unitNV._id, date: d(-6), startTime: '10:00', endTime: addMin('10:00', 30), status: 'completed', price: 35 });
  const a9  = await AppointmentModel.create({ clientId: cli6._id, employeeId: brunoEmp._id, serviceId: svcComboNV._id, unitId: unitNV._id, date: d(-5), startTime: '13:00', endTime: addMin('13:00', 45), status: 'completed', price: 55 });
  const a10 = await AppointmentModel.create({ clientId: cli7._id, employeeId: thiago._id,   serviceId: svcBarbaNV._id, unitId: unitNV._id, date: d(-3), startTime: '16:00', endTime: addMin('16:00', 20), status: 'completed', price: 25 });
  await AppointmentModel.create({ clientId: cli5._id, employeeId: brunoEmp._id, serviceId: svcCorteNV._id, unitId: unitNV._id, date: d(0),  startTime: '11:00', endTime: addMin('11:00', 30), status: 'confirmed', price: 35 });
  await AppointmentModel.create({ clientId: cli6._id, employeeId: thiago._id,   serviceId: svcComboNV._id, unitId: unitNV._id, date: d(3),  startTime: '14:00', endTime: addMin('14:00', 45), status: 'confirmed', price: 55 });

  console.log('📅 Agendamentos criados');

  // ── TRANSAÇÕES ──────────────────────────────────────────────────────────
  await TransactionModel.insertMany([
    // Receitas — Jd Sol
    { unitId: unitSol._id, appointmentId: a1._id, type: 'income',  category: 'service', amount: 35,   description: 'Corte Simples — João Silva',      date: d(-8), createdBy: owner._id },
    { unitId: unitSol._id, appointmentId: a2._id, type: 'income',  category: 'service', amount: 25,   description: 'Barba — Pedro Costa',              date: d(-7), createdBy: owner._id },
    { unitId: unitSol._id, appointmentId: a3._id, type: 'income',  category: 'service', amount: 55,   description: 'Corte + Barba — Lucas Mendes',     date: d(-6), createdBy: owner._id },
    { unitId: unitSol._id, appointmentId: a4._id, type: 'income',  category: 'service', amount: 35,   description: 'Corte Simples — Carlos Ferreira',  date: d(-5), createdBy: owner._id },
    { unitId: unitSol._id, appointmentId: a5._id, type: 'income',  category: 'service', amount: 80,   description: 'Pigmentação — João Silva',         date: d(-4), createdBy: owner._id },
    { unitId: unitSol._id, appointmentId: a6._id, type: 'income',  category: 'service', amount: 55,   description: 'Corte + Barba — Pedro Costa',      date: d(-3), createdBy: owner._id },
    { unitId: unitSol._id, appointmentId: a7._id, type: 'income',  category: 'service', amount: 40,   description: 'Hidratação — Lucas Mendes',        date: d(-2), createdBy: owner._id },
    // Venda de produto — Jd Sol
    { unitId: unitSol._id,                         type: 'income',  category: 'product', amount: 38,   description: 'Venda — Pomada Modeladora Matte',  date: d(-4), createdBy: marcos._id },
    { unitId: unitSol._id,                         type: 'income',  category: 'product', amount: 52,   description: 'Venda — Óleo de Barba Premium',    date: d(-2), createdBy: rafaelEmp._id },
    // Despesas — Jd Sol
    { unitId: unitSol._id,                         type: 'expense', category: 'salary',  amount: 2800, description: 'Salário — Marcos Oliveira',        date: d(-1), createdBy: owner._id },
    { unitId: unitSol._id,                         type: 'expense', category: 'salary',  amount: 2600, description: 'Salário — Rafael Costa',           date: d(-1), createdBy: owner._id },
    { unitId: unitSol._id,                         type: 'expense', category: 'rent',    amount: 3500, description: 'Aluguel — maio/2026',              date: d(-1), createdBy: owner._id },
    { unitId: unitSol._id,                         type: 'expense', category: 'other',   amount: 320,  description: 'Conta de luz — maio/2026',         date: d(-2), createdBy: owner._id },
    { unitId: unitSol._id,                         type: 'royalty', category: 'other',   amount: 370,  description: 'Royalty 8% — Rede Délio (abril)',  date: d(-5), createdBy: owner._id },
    // Receitas — Nova Veneza
    { unitId: unitNV._id,  appointmentId: a8._id,  type: 'income',  category: 'service', amount: 35,   description: 'Corte Simples — Anderson Lima',    date: d(-6), createdBy: owner._id },
    { unitId: unitNV._id,  appointmentId: a9._id,  type: 'income',  category: 'service', amount: 55,   description: 'Corte + Barba — Rodrigo Nunes',   date: d(-5), createdBy: owner._id },
    { unitId: unitNV._id,  appointmentId: a10._id, type: 'income',  category: 'service', amount: 25,   description: 'Barba — Felipe Martins',           date: d(-3), createdBy: owner._id },
    // Despesas — Nova Veneza
    { unitId: unitNV._id,                          type: 'expense', category: 'salary',  amount: 2600, description: 'Salário — Thiago Almeida',        date: d(-1), createdBy: owner._id },
    { unitId: unitNV._id,                          type: 'expense', category: 'salary',  amount: 2400, description: 'Salário — Bruno Souza',            date: d(-1), createdBy: owner._id },
    { unitId: unitNV._id,                          type: 'expense', category: 'rent',    amount: 2800, description: 'Aluguel — maio/2026',              date: d(-1), createdBy: owner._id },
    { unitId: unitNV._id,                          type: 'royalty', category: 'other',   amount: 230,  description: 'Royalty 8% — Rede Délio (abril)',  date: d(-5), createdBy: owner._id },
  ]);

  console.log('💰 Transações criadas');

  // ── TAREFAS ─────────────────────────────────────────────────────────────
  await TaskModel.insertMany([
    // Admin
    { title: 'Renovar contrato de aluguel',       description: 'Entrar em contato com a imobiliária antes do vencimento em junho', system: 'admin', status: 'todo',  priority: 'high',   dueDate: d(15) },
    { title: 'Contratar novo barbeiro',            description: 'Publicar vaga e realizar entrevistas para cobrir a demanda de sábados', system: 'admin', status: 'doing', priority: 'high',   dueDate: d(20) },
    { title: 'Reunião mensal com franqueadora',    description: 'Preparar relatório de faturamento e métricas do mês',                system: 'admin', status: 'todo',  priority: 'medium', dueDate: d(7)  },
    { title: 'Revisar metas do trimestre',         description: 'Analisar indicadores e definir metas para o próximo trimestre',      system: 'admin', status: 'todo',  priority: 'medium', dueDate: d(10) },
    { title: 'Atualizar cardápio de serviços',     description: 'Revisar preços e adicionar novos serviços ao menu',                   system: 'admin', status: 'done',  priority: 'low',    dueDate: d(-3) },
    // Franchise
    { title: 'Repor estoque de pomadas',           description: 'Pedir 20 unidades da pomada matte e 10 do óleo de barba',            system: 'franchise', status: 'todo',  priority: 'high',   dueDate: d(3)  },
    { title: 'Manutenção das cadeiras',            description: 'Cadeira 2 com hidráulico com folga, chamar técnico',                  system: 'franchise', status: 'doing', priority: 'medium', dueDate: d(5)  },
    { title: 'Limpeza dos ar-condicionados',       description: 'Agendada para o próximo mês com técnico credenciado',                 system: 'franchise', status: 'todo',  priority: 'low',    dueDate: d(18) },
    { title: 'Treinamento de atendimento',         description: 'Equipe passará por reciclagem de atendimento ao cliente',             system: 'franchise', status: 'done',  priority: 'medium', dueDate: d(-3) },
    { title: 'Instalar nova iluminação',           description: 'Substituir lâmpadas antigas por LED na área de atendimento',          system: 'franchise', status: 'todo',  priority: 'low',    dueDate: d(25) },
  ]);

  console.log('✅ Tarefas criadas');

  // ── RESUMO ──────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    AppointmentModel.countDocuments(),
    TransactionModel.countDocuments(),
    ProductModel.countDocuments(),
    TaskModel.countDocuments(),
    ClientModel.countDocuments(),
    ServiceModel.countDocuments(),
  ]);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌱  Seed concluído!\n');
  console.log('📊  Dados inseridos:');
  console.log(`    • ${counts[4]} clientes  • ${counts[5]} serviços`);
  console.log(`    • ${counts[2]} produtos  • ${counts[0]} agendamentos`);
  console.log(`    • ${counts[1]} transações  • ${counts[3]} tarefas`);
  console.log('\n🔑  Logins:');
  console.log('    delio@barbeariadelio.com.br   →  admin123  (franchisor)');
  console.log('    admin@barbeariadelio.com.br   →  admin123  (owner/admin)');
  console.log('    marcos@barbeariadelio.com.br  →  marcos123 (employee — Jd Sol)');
  console.log('    rafael@barbeariadelio.com.br  →  rafael123 (employee — Jd Sol)');
  console.log('    thiago@barbeariadelio.com.br  →  thiago123 (employee — Nova Veneza)');
  console.log('    bruno@barbeariadelio.com.br   →  bruno123  (employee — Nova Veneza)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});
