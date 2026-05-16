let app;

try {
  app = require("../backend/app");
} catch (error) {
  console.error("[startup]", error);
  app = (req, res) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      message: "Falha ao iniciar API.",
      error: error.message
    }));
  };
}

module.exports = app;
