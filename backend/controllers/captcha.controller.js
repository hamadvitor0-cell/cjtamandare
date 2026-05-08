const CaptchaService = require("../services/captcha.service");

async function challenge(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    captcha: CaptchaService.createChallenge(req)
  });
}

module.exports = {
  challenge
};
