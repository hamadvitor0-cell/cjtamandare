function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const first = digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0);
  const firstCheck = (first * 10) % 11 % 10;
  if (firstCheck !== digits[9]) return false;

  const second = digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0);
  const secondCheck = (second * 10) % 11 % 10;
  return secondCheck === digits[10];
}

function maskCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

module.exports = {
  normalizeCpf,
  isValidCpf,
  maskCpf
};
