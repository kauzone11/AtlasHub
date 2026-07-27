import crypto from "crypto";

const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_";

function pick(source: string) {
  return source[crypto.randomInt(0, source.length)];
}

export function generateHubTemporaryPassword() {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const alphabet = LOWER + UPPER + DIGITS + SYMBOLS;
  while (required.length < 16) required.push(pick(alphabet));
  for (let index = required.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0, index + 1);
    [required[index], required[swap]] = [required[swap], required[index]];
  }
  return required.join("");
}

export function validateHubPassword(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Use letras maiúsculas, minúsculas e pelo menos um número.";
  }
  if (/hub/i.test(password) && /\d/.test(password)) {
    return "Escolha uma senha que não use o nome do produto.";
  }
  return null;
}
