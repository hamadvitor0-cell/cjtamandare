const AuthService = require("../services/auth.service");
const { cookieOptions } = require("../config/security");

async function login(req, res) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");

  const result = await AuthService.login({
    username: req.validated.body.username,
    registrationCode: req.validated.body.registrationCode,
    ip: req.ip
  });

  res.cookie("access_token", result.token, {
    ...cookieOptions,
    maxAge: AuthService.tokenMaxAgeMs
  });

  return res.json({
    message: "Login realizado com sucesso.",
    admin: result.admin
  });
}

function me(req, res) {
  return res.json({
    admin: {
      id: req.user.sub,
      name: req.user.name,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
}

function logout(req, res) {
  res.clearCookie("access_token", {
    ...cookieOptions,
    maxAge: undefined
  });
  res.clearCookie("csrf_token", {
    ...cookieOptions,
    maxAge: undefined
  });

  return res.json({ message: "Sessão encerrada." });
}

module.exports = {
  login,
  me,
  logout
};
