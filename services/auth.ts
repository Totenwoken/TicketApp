import * as db from './db';
import { User } from '../types';

// Helper for hashing
// MODIFIED: No longer forces lowercase. This ensures passwords are case-sensitive.
const hashString = async (text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text); 
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

export const register = async (name: string, email: string, password: string, securityQuestion: string, securityAnswer: string): Promise<User> => {
  if (!PASSWORD_REGEX.test(password)) {
    throw new Error("La contraseña no cumple los requisitos de seguridad.");
  }

  const cleanEmail = email.toLowerCase().trim();
  // We want security answers to be case-insensitive for better UX
  const cleanAnswer = securityAnswer.toLowerCase().trim(); 
  
  // Hash password RAW (preserving case)
  const hashedPassword = await hashString(password); 
  const hashedAnswer = await hashString(cleanAnswer);
  
  const newUser: User = {
    email: cleanEmail,
    name: name.trim(),
    passwordHash: hashedPassword,
    createdAt: Date.now(),
    securityQuestion: securityQuestion,
    securityAnswerHash: hashedAnswer
  };

  await db.createUser(newUser);
  
  console.log(`[SIMULACIÓN EMAIL] Enviando bienvenida a: ${cleanEmail}`);
  
  return newUser;
};

export const login = async (email: string, password: string): Promise<User> => {
  const cleanEmail = email.toLowerCase().trim();
  const user = await db.getUser(cleanEmail);
  
  if (!user) {
    throw new Error("Usuario no encontrado.");
  }

  // Hash password RAW to compare with stored hash
  const inputHash = await hashString(password);
  
  if (inputHash !== user.passwordHash) {
    throw new Error("Contraseña incorrecta.");
  }

  return user;
};

// Recovery Process

export const verifySecurityAnswer = async (email: string, answer: string): Promise<User> => {
  const cleanEmail = email.toLowerCase().trim();
  const user = await db.getUser(cleanEmail);

  if (!user) throw new Error("Usuario no encontrado.");
  if (!user.securityAnswerHash) throw new Error("Este usuario no tiene configurada la recuperación.");

  // Clean input answer to match stored format
  const cleanAnswer = answer.toLowerCase().trim();
  const inputAnswerHash = await hashString(cleanAnswer);
  
  if (inputAnswerHash !== user.securityAnswerHash) {
    throw new Error("Respuesta de seguridad incorrecta.");
  }

  return user;
};

export const resetPassword = async (email: string, newPassword: string): Promise<void> => {
  if (!PASSWORD_REGEX.test(newPassword)) {
    throw new Error("La contraseña no cumple los requisitos.");
  }
  
  const cleanEmail = email.toLowerCase().trim();
  const user = await db.getUser(cleanEmail);
  if (!user) throw new Error("Usuario no encontrado.");

  const newHash = await hashString(newPassword);
  
  const updatedUser: User = {
    ...user,
    passwordHash: newHash
  };

  await db.updateUser(updatedUser);
};