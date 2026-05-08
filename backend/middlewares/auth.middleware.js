const AuthService = require("../services/auth.service");

function requireAuth(req, res, next) {
  const token = req.cookies.access_token;

  if (!token) {
    return res.status(401).json({ message: "Autenticação obrigatória." });
  }

  try {
    req.user = AuthService.verifyToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Sessão expirada ou inválida." });
  }
}

function authorizeRoles(...roles) {
  return function authorize(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Acesso não autorizado." });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  authorizeRoles
};
