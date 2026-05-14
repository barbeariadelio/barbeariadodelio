
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AuthService } from './src/modules/auth/auth.service';
import { env } from './src/config/env';

async function test() {
  try {
    await mongoose.connect(env.mongodbUri);
    console.log('Connected to MongoDB');

    const service = new AuthService();
    console.log('Testing bookingLogin...');
    
    // Test with a new user
    const name = 'Test User ' + Date.now();
    const phone = '1199999' + Math.floor(Math.random() * 10000);
    
    const result = await service.bookingLogin(name, phone);
    console.log('Booking Login Success:', result.user.name);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Booking Login Error:', err);
    process.exit(1);
  }
}

test();
