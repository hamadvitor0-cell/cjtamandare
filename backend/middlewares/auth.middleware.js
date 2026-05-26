const AuthService = require("../services/auth.service");
const Admin = require("../models/admin.model");
const Aluno = require("../models/aluno.model");
const Audit = require("../models/audit.model");

function disablePrivateCache(res) {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
}

async function requireAuth(req, res, next) {
  disablePrivateCache(res);
  const token = req.cookies.access_token;

  if (!token) {
    return res.status(401).json({ message: "Autenticação obrigatória." });
  }

  let claims;
  try {
    claims = AuthService.verifyToken(token);
  } catch (error) {
    return res.status(401).json({ message: "Sessão expirada ou inválida." });
  }

  try {
    const admin = await Admin.findById(claims.sub);
    if (!admin || !admin.active || Number(claims.ver) !== Number(admin.token_version || 0)) {
      return res.status(401).json({ message: "Sessão expirada ou inválida." });
    }
    // Authorization uses the current server-side role, never JWT claims from an older session.
    req.user = {
      sub: admin.id,
      name: admin.name,
      username: admin.username,
      email: admin.email,
      role: admin.role
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireStudentAuth(req, res, next) {
  disablePrivateCache(res);
  const token = req.cookies.student_access_token;

  if (!token) {
    return res.status(401).json({ message: "Entre no Portal do Aluno para continuar." });
  }

  try {
    const claims = AuthService.verifyStudentToken(token);
    const student = await Aluno.findById(claims.sub);
    if (!student || student.status === "inativo" || Number(claims.ver) !== Number(student.tokenVersion || 0)) {
      return res.status(401).json({ message: "Sessão do aluno expirada ou inválida." });
    }
    req.student = {
      sub: student.id,
      role: "student",
      ver: Number(student.tokenVersion || 0)
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Sessão do aluno expirada ou inválida." });
  }
}

function authorizeRoles(...roles) {
  return function authorize(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      if (req.user) {
        Audit.create({
          admin: req.user,
          action: "denied",
          entityType: "authz",
          metadata: {
            method: req.method,
            path: req.path,
            requiredRoles: roles
          },
          ip: req.ip
        }).catch(() => {});
      }
      return res.status(403).json({ message: "Acesso não autorizado." });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireStudentAuth,
  authorizeRoles
};
