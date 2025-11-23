import * as db from './db';
import { User } from '../types';

// Web Crypto API for secure hashing in the browser
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Password Validation Regex
// At least: 1 uppercase, 1 lowercase, 1 number, 1 special char, 8+ chars
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export const register = async (name: string, email: string, password: string): Promise<User> => {
  if (!PASSWORD_REGEX.test(password)) {
    throw new Error("La contraseña no cumple los requisitos de seguridad.");
  }

  const hashedPassword = await hashPassword(password);
  
  const newUser: User = {
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: hashedPassword,
    createdAt: Date.now()
  };

  await db.createUser(newUser);
  return newUser;
};

export const login = async (email: string, password: string): Promise<User> => {
  const cleanEmail = email.toLowerCase().trim();
  const user = await db.getUser(cleanEmail);
  
  if (!user) {
    throw new Error("Usuario no encontrado.");
  }

  const inputHash = await hashPassword(password);
  
  if (inputHash !== user.passwordHash) {
    throw new Error("Contraseña incorrecta.");
  }

  return user;
};